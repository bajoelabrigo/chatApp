import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';

// ---------------------------------------------------------------------------
// Vista previa de enlaces (Open Graph) — estilo WhatsApp
// ---------------------------------------------------------------------------
// Devuelve { url, title, description, image, siteName } para un enlace. Lo
// consumen el chat móvil y el chat web (ambos son clientes de este backend).
// Se hace en el servidor porque el cliente no puede leer el HTML de otro
// dominio (CORS) ni parsear sus meta tags.

interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

// Caché en memoria por URL (24h). Evita re-descargar la misma página en cada
// render de la burbuja o cada vez que alguien abre la conversación.
const PREVIEW_TTL = 1000 * 60 * 60 * 24; // 24h
const previewCache = new Map<string, { at: number; data: LinkPreviewData | null }>();

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// Lee el content de un <meta> por property/name, tolerando el orden de los
// atributos (content antes o después de property/name).
function getMeta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return '';
}

// Bloquea destinos internos (SSRF): solo http/https y hostnames públicos.
function isSafePublicUrl(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host.endsWith('youtube.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

async function buildPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isSafePublicUrl(u)) return null;

  // YouTube: oEmbed da título/miniatura/autor de forma fiable (sin parsear HTML).
  const ytId = youtubeId(u);
  if (ytId) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${ytId}`,
      )}&format=json`;
      const r = await fetchWithTimeout(oembedUrl, 6000);
      if (r.ok) {
        const j: any = await r.json();
        return {
          url: `https://www.youtube.com/watch?v=${ytId}`,
          title: j.title || 'YouTube',
          description: j.author_name ? `${j.author_name} · YouTube` : 'YouTube',
          image: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          siteName: 'YouTube',
        };
      }
    } catch {
      // cae al genérico de abajo
    }
    // Aunque falle oEmbed, la miniatura siempre existe.
    return {
      url: `https://www.youtube.com/watch?v=${ytId}`,
      title: 'YouTube',
      description: 'YouTube',
      image: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      siteName: 'YouTube',
    };
  }

  // Genérico: descargar el HTML y leer los Open Graph / meta tags.
  let html = '';
  try {
    const r = await fetchWithTimeout(u.toString(), 6000, {
      'User-Agent':
        'Mozilla/5.0 (compatible; HolyChatBot/1.0; +https://holyholyholy.es)',
      Accept: 'text/html,application/xhtml+xml',
    });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('html')) return null;
    // Solo necesitamos el <head>; cortamos a 256 KB para no descargar de más.
    const buf = await r.arrayBuffer();
    html = Buffer.from(buf.slice(0, 262144)).toString('utf8');
  } catch {
    return null;
  }

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title =
    getMeta(html, 'og:title') ||
    getMeta(html, 'twitter:title') ||
    (titleTag ? decodeEntities(titleTag[1].trim()) : '');
  const description =
    getMeta(html, 'og:description') ||
    getMeta(html, 'twitter:description') ||
    getMeta(html, 'description');
  let image =
    getMeta(html, 'og:image') ||
    getMeta(html, 'og:image:url') ||
    getMeta(html, 'twitter:image');
  const siteName = getMeta(html, 'og:site_name') || u.hostname.replace(/^www\./, '');

  // Resolver imágenes relativas contra el origen.
  if (image && !/^https?:\/\//i.test(image)) {
    try {
      image = new URL(image, u.origin).toString();
    } catch {
      image = '';
    }
  }

  if (!title && !description && !image) return null; // nada útil → sin preview

  return {
    url: rawUrl,
    title: title.slice(0, 200),
    description: description.slice(0, 300),
    image,
    siteName,
  };
}

// Devuelve la Response del fetch global (Node 18+). Tipada como `any` para no
// colisionar con el `Response` de Express importado arriba ni depender de los
// tipos DOM.
function fetchWithTimeout(
  url: string,
  ms: number,
  headers?: Record<string, string>,
): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return (globalThis as any)
    .fetch(url, { signal: controller.signal, headers, redirect: 'follow' })
    .finally(() => clearTimeout(t));
}

/**
 * GET /public/link-preview?url=<enlace>
 * Metadata Open Graph para pintar la tarjeta de vista previa en el chat.
 */
export async function linkPreview(req: Request, res: Response): Promise<void> {
  const raw = String(req.query.url ?? '').trim();
  if (!raw) {
    res.status(400).json({ error: 'Falta el parámetro url' });
    return;
  }

  const cached = previewCache.get(raw);
  if (cached && Date.now() - cached.at < PREVIEW_TTL) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!cached.data) {
      res.status(404).json({ error: 'Sin vista previa' });
      return;
    }
    res.json(cached.data);
    return;
  }

  try {
    const data = await buildPreview(raw);
    previewCache.set(raw, { at: Date.now(), data });
    // Poda simple para que el Map no crezca sin límite.
    if (previewCache.size > 2000) {
      const firstKey = previewCache.keys().next().value;
      if (firstKey) previewCache.delete(firstKey);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!data) {
      res.status(404).json({ error: 'Sin vista previa' });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error generando vista previa' });
  }
}

/**
 * Perfil público mínimo de un usuario para la página de invitación de la web.
 * No requiere autenticación: solo expone datos visibles en el chat.
 */
export async function getPublicUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('name avatar bio').lean();
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json({
      _id: user._id,
      name: user.name,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

/**
 * Info pública mínima de un grupo para la página de invitación de la web.
 */
export async function getPublicGroup(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const conv = await Conversation.findOne({ _id: id, isGroup: true })
      .select('groupName groupAvatar participants')
      .lean();
    if (!conv) {
      res.status(404).json({ error: 'Grupo no encontrado' });
      return;
    }
    res.json({
      _id: conv._id,
      groupName: conv.groupName ?? 'Grupo',
      groupAvatar: conv.groupAvatar ?? '',
      participantCount: (conv.participants as any[])?.length ?? 0,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo grupo' });
  }
}

// ---------------------------------------------------------------------------
// Fotos de fondo (Pexels) para "compartir versículo como imagen"
// ---------------------------------------------------------------------------
// La clave de Pexels vive en el servidor (PEXELS_API_KEY). El cliente busca por
// /public/photos y usa /public/photo?url= como proxy con CORS, para que
// html2canvas pueda capturar la foto sin "manchar" el canvas (cross-origin).

const PHOTO_HOST_ALLOW = /(^|\.)pexels\.com$|(^|\.)pixabay\.com$/i;

/** GET /public/photos?q=&page= — busca fotos en Pexels. */
export async function searchPhotos(req: Request, res: Response): Promise<void> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    res.status(503).json({ error: 'Búsqueda de fotos no configurada' });
    return;
  }
  const q = String(req.query.q ?? '').trim();
  const page = Math.min(Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1), 50);
  const per = 24;
  const endpoint = q
    ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per}&page=${page}`
    : `https://api.pexels.com/v1/curated?per_page=${per}&page=${page}`;
  try {
    const r = await fetchWithTimeout(endpoint, 8000, { Authorization: key });
    if (!r.ok) {
      res.status(502).json({ error: 'Error consultando Pexels' });
      return;
    }
    const j: any = await r.json();
    const photos = (j.photos || []).map((p: any) => ({
      id: p.id,
      thumb: p.src?.tiny || p.src?.small,
      full: p.src?.large2x || p.src?.large || p.src?.original,
      photographer: p.photographer,
      alt: p.alt || '',
    }));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ photos, page });
  } catch {
    res.status(500).json({ error: 'Error buscando fotos' });
  }
}

/** GET /public/photo?url=<imagen> — proxy con CORS para html2canvas. */
export async function proxyPhoto(req: Request, res: Response): Promise<void> {
  const raw = String(req.query.url ?? '').trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    res.status(400).json({ error: 'URL inválida' });
    return;
  }
  if (!isSafePublicUrl(u) || !PHOTO_HOST_ALLOW.test(u.hostname)) {
    res.status(400).json({ error: 'Host no permitido' });
    return;
  }
  try {
    const r = await fetchWithTimeout(u.toString(), 10000, { 'User-Agent': 'HolyChat/1.0' });
    if (!r.ok) {
      res.status(502).end();
      return;
    }
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) {
      res.status(415).end();
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    res.status(500).end();
  }
}

/**
 * Genera un código QR (PNG) para cualquier texto/URL.
 * Uso: GET /public/qr?data=<url>&size=300
 * Pensado para la app móvil, que no tiene librería de QR nativa.
 */
export async function qrCode(req: Request, res: Response): Promise<void> {
  try {
    const data = String(req.query.data ?? '').trim();
    if (!data) {
      res.status(400).json({ error: 'Falta el parámetro data' });
      return;
    }
    const size = Math.min(Math.max(parseInt(String(req.query.size ?? '300'), 10) || 300, 100), 1000);
    const buffer = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Error generando QR' });
  }
}

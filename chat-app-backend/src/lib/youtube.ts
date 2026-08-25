// Utilidades de YouTube compartidas (reels/historias y vistas previas).
const YT_HOSTS = ['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com'];

/** Extrae el videoId de cualquier forma de enlace de YouTube (watch, shorts, embed, youtu.be). */
export function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host.endsWith('youtube.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** ¿Es un enlace de YouTube? */
export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return YT_HOSTS.includes(u.hostname.replace(/^www\./, '')) && !!youtubeId(u);
  } catch {
    return false;
  }
}

interface YouTubeMeta {
  videoId: string;
  title: string;
  thumbUrl: string;
}

// oEmbed público (sin API key), cacheado 6 h en memoria (como las vistas previas).
const metaCache = new Map<string, { at: number; data: YouTubeMeta | null }>();
const META_TTL = 6 * 3600 * 1000;

/**
 * Título + miniatura de un video de YouTube vía oEmbed. Best-effort: si falla,
 * se devuelve el id con un título genérico y la miniatura hqdefault (que existe
 * para cualquier video).
 */
export async function getYouTubeMeta(url: string): Promise<YouTubeMeta | null> {
  let id: string | null = null;
  try {
    id = youtubeId(new URL(url));
  } catch {
    return null;
  }
  if (!id) return null;

  const cached = metaCache.get(id);
  if (cached && Date.now() - cached.at < META_TTL) return cached.data;

  let meta: YouTubeMeta = { videoId: id, title: 'Video de YouTube', thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, {
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const j: any = await r.json();
      if (j?.title) meta = { ...meta, title: String(j.title).slice(0, 200) };
    }
  } catch {
    // sin oEmbed: quedan el id y la miniatura genérica
  }
  metaCache.set(id, { at: Date.now(), data: meta });
  if (metaCache.size > 500) {
    const oldest = metaCache.keys().next().value;
    if (oldest) metaCache.delete(oldest);
  }
  return meta;
}

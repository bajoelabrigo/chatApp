import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Metadata de un enlace (título, descripción, imagen) con caché persistente.
// Espejo de `holy_app/frontend/src/lib/linkMeta.js` — al tocar las reglas,
// editar las dos. La metadata la sirve el mismo endpoint que usa la web
// (`GET /public/link-preview`, que lee los Open Graph y usa oEmbed en YouTube
// y TikTok). Los enlaces a /materiales/:slug los resuelve ese mismo endpoint
// con los datos reales del material —comprobado contra producción—, así que
// aquí no hace falta el caso especial que sí tiene la web.

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

const TTL = 1000 * 60 * 60 * 24 * 30; // 30 días para previas buenas
// TTL corto para los "sin preview": un fallo pasajero no debe envenenar la
// caché un mes entero.
const TTL_NULL = 1000 * 60 * 30;
const VERSION = 'v1';
const keyFor = (url: string) => `linkpreview:${VERSION}:${url}`;

export interface LinkMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  publisher: string;
}

// Una previa sin título NI imagen no dice más que el enlace desnudo.
const isUsable = (m: LinkMeta | null): boolean => Boolean(m && (m.title || m.image));

// Caché en memoria: la lista del feed se repinta al desplazarse y AsyncStorage
// es asíncrono, así que sin esto la tarjeta parpadearía en cada render.
const mem = new Map<string, LinkMeta | null>();

export function hostnameOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].replace(/^www\./, '') : url;
}

async function readCache(url: string): Promise<LinkMeta | null | undefined> {
  if (mem.has(url)) return mem.get(url);
  try {
    const raw = await AsyncStorage.getItem(keyFor(url));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { data: LinkMeta | null; at: number };
    if (Date.now() - parsed.at > (parsed.data ? TTL : TTL_NULL)) return undefined;
    mem.set(url, parsed.data);
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeCache(url: string, data: LinkMeta | null) {
  mem.set(url, data);
  AsyncStorage.setItem(keyFor(url), JSON.stringify({ data, at: Date.now() })).catch(() => {});
}

async function fetchMeta(url: string): Promise<LinkMeta | null> {
  const res = await fetch(`${API_URL}/public/link-preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  const d = await res.json();
  return {
    url: d.url || url,
    title: d.title || '',
    description: d.description || '',
    image: d.image || '',
    publisher: d.siteName || hostnameOf(url),
  };
}

/** `data`: `undefined` mientras carga, `null` si no hay previa, u objeto. */
export function useLinkMeta(url?: string | null) {
  const [data, setData] = useState<LinkMeta | null | undefined>(() =>
    url && mem.has(url) ? mem.get(url) : undefined
  );
  const [loading, setLoading] = useState(Boolean(url) && !(url && mem.has(url)));

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    readCache(url).then((cached) => {
      if (!active) return;
      if (cached !== undefined) {
        setData(cached);
        setLoading(false);
        return;
      }
      fetchMeta(url)
        .then((meta) => {
          if (!active) return;
          const usable = isUsable(meta) ? meta : null;
          setData(usable);
          writeCache(url, usable);
        })
        .catch(() => {
          // El fallo no se cachea: se reintenta al volver a montar.
          if (active) setData(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
    };
  }, [url]);

  return { data, loading };
}

// Mismo regex que `utils/extraLinks.js` de la web: no se cuela el marcado del
// texto enriquecido porque excluye < > " '.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** URLs del texto de un post, sin repetir y sin la puntuación final. */
export function extractLinks(text?: string | null): string[] {
  if (!text) return [];
  const found = text.match(URL_RE) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const url = raw.replace(/[).,;:!?]+$/, '');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

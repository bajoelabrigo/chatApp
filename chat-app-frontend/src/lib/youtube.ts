// Extrae el ID de un enlace de YouTube (watch/youtu.be/embed/shorts) para armar
// la miniatura sin backend propio — mismo host (`i.ytimg.com`) que usa
// `LiteYouTube.jsx` en la web.
export function youtubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function youtubeThumbnail(url?: string | null): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

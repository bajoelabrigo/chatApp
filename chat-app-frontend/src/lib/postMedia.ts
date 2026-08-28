/**
 * Adjunto de una publicación (`post.image`).
 *
 * El campo se llama `image` por historia, pero guarda CUALQUIER archivo: foto,
 * video, PDF… Y la web añade el nombre original en el fragmento de la URL
 * (`…/xyz.mp4#name=Mi%20video.mp4`) — el fragmento nunca viaja al servidor, así
 * que hay que quitarlo antes de usar la URL o de leer la extensión.
 *
 * Espejo de `holy_app/frontend/src/lib/fileName.js`: al tocar las reglas,
 * editar las dos.
 */

/** URL sin el fragmento `#name=…`, para reproducir/descargar y para la extensión. */
export const cleanUrl = (url?: string | null): string => (url ?? '').split('#')[0];

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'qt', 'webm', 'ogv', 'mpeg', 'mpg', '3gp', '3gpp', 'avi', 'mkv'];
// Cloudinary sube el audio con `resource_type: 'video'`, así que la carpeta
// `/video/upload/` NO basta para distinguirlos: la extensión manda.
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'opus', 'oga', 'flac'];

function extOf(url?: string | null): string {
  const u = cleanUrl(url).split('?')[0].toLowerCase();
  const last = u.split('/').pop() ?? '';
  return last.includes('.') ? last.split('.').pop()! : '';
}

/** ¿El adjunto es un video reproducible? */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const ext = extOf(url);
  if (AUDIO_EXT.includes(ext)) return false;
  if (VIDEO_EXT.includes(ext)) return true;
  // Sin extensión reconocible (subidas antiguas sin nombre), la carpeta de
  // Cloudinary es lo único que queda.
  return cleanUrl(url).includes('/video/upload/');
}

/** ¿El adjunto es una imagen? (lo que puede ir a `<Image>` sin romperse) */
export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const ext = extOf(url);
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp'].includes(ext)) return true;
  return !isVideoUrl(url) && !AUDIO_EXT.includes(ext) && cleanUrl(url).includes('/image/upload/');
}

/** Nombre a mostrar: el original del fragmento, o uno limpio por extensión. */
export function fileDisplayName(url?: string | null): string {
  const m = (url ?? '').match(/#name=([^#]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  return `Archivo.${extOf(url) || 'bin'}`;
}

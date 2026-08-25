import { PixelRatio } from 'react-native';

/**
 * Optimización de entrega de imágenes de Cloudinary.
 *
 * NO toca el archivo guardado: reescribe la URL para que Cloudinary sirva una
 * versión derivada (formato moderno + compresión perceptual + el ancho que de
 * verdad se pinta). Revertirlo es dejar de llamar a `cld()`.
 *
 * El grueso del gasto de Cloudinary es ancho de banda: un avatar de 46dp
 * descargaba la foto original de 3000px. Aquí se pide justo lo que se ve.
 */

// Escalones de ancho. Se redondea hacia arriba al escalón siguiente para que
// dos dispositivos parecidos compartan la MISMA URL: cada ancho distinto es un
// asset derivado nuevo (y las transformaciones también se facturan).
const LADDER = [32, 48, 64, 96, 128, 160, 192, 256, 320, 400, 512, 640, 800, 1080, 1440, 1920];

function bucket(px: number): number {
  return LADDER.find((w) => w >= px) ?? LADDER[LADDER.length - 1];
}

type Opts = {
  /** `limit` (por defecto) nunca amplía; `fill` recorta al cuadro exacto. */
  crop?: 'limit' | 'fill';
  /** Alto en dp. Solo tiene sentido con `crop: 'fill'`. */
  h?: number;
};

/**
 * @param url   URL de la imagen. Si no es de Cloudinary (avatar de Google,
 *              foto de Pexels, `file://` de una previa local…) se devuelve
 *              intacta.
 * @param width Ancho en dp al que se PINTA. Omitirlo optimiza formato y
 *              compresión sin limitar el tamaño (visores a pantalla completa).
 */
export function cld(url: string | null | undefined, width?: number, opts: Opts = {}): string {
  if (!url || typeof url !== 'string') return url as string;
  if (!url.includes('res.cloudinary.com')) return url;

  // Solo imágenes: en `/video/upload/` y `/raw/upload/` estas transformaciones
  // no aplican igual (y los documentos se romperían).
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url;

  const rest = url.slice(at + marker.length);
  // Si la URL YA trae transformaciones (p.ej. el póster de video), no encadenar
  // otra encima: se respeta lo que puso quien la construyó.
  const firstSegment = rest.split('/')[0];
  if (firstSegment && !/^v\d+$/.test(firstSegment) && /^[a-z]{1,3}_/.test(firstSegment)) {
    return url;
  }

  const parts = ['f_auto', 'q_auto'];
  if (width) {
    // dp → píxeles reales de la pantalla. Se topa en 3x: por encima el peso
    // extra ya no se nota a simple vista.
    const scale = Math.min(PixelRatio.get(), 3);
    const crop = opts.crop ?? 'limit';
    parts.push(`c_${crop}`, `w_${bucket(Math.round(width * scale))}`);
    if (opts.h) parts.push(`h_${bucket(Math.round(opts.h * scale))}`);
  }

  return `${url.slice(0, at + marker.length)}${parts.join(',')}/${rest}`;
}

/**
 * URL de REPRODUCCIÓN de un video de Cloudinary (espejo en holy_app:
 * `holy_app/frontend/src/lib/cldImage.js`).
 *
 * Los videos se suben como vinieron (Android/Chrome suelen mandar WebM), y
 * **Safari/iPhone NO reproduce WebM** → el video se ve negro en iOS. `f_mp4`
 * pide a Cloudinary el MISMO video en contenedor MP4 con codec H.264/AAC, que
 * iOS sí reproduce. Solo toca `/video/upload/`; cualquier otra URL (previa
 * local, YouTube, descarga) se devuelve intacta.
 *
 * Para ABRIR/COMPARTIR/descargar se usa SIEMPRE la URL original, no esta.
 */
export function videoPlayUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return url as string;
  const marker = '/video/upload/';
  if (!url.includes(marker)) return url;
  return url.replace(marker, `${marker}f_mp4/`);
}

import multer from 'multer';

// El navegador manda el mimetype del Blob TAL CUAL, y MediaRecorder devuelve
// "audio/webm;codecs=opus" (con parámetros). Comparar esa cadena contra una lista
// de mimetypes "limpios" fallaba siempre: las notas de voz grabadas en la web se
// rechazaban aunque audio/webm estuviera permitido. Normalizamos antes de comparar.
export function normalizeMime(mimetype: string): string {
  return (mimetype || '').split(';')[0].trim().toLowerCase();
}

const ALLOWED_AUDIO = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav',
  'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/opus', 'audio/flac', 'audio/3gpp',
  // Contenedor que usa MediaRecorder en Chrome/Firefox para grabar voz.
  'audio/webm',
];

const ALLOWED_VIDEO = [
  'video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime', 'video/x-matroska',
  'video/x-msvideo', 'video/3gpp', 'video/ogg',
];

const ALLOWED_DOCUMENT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'text/plain',
  'text/csv',
];

export const ALLOWED_MIME_TYPES = [...ALLOWED_AUDIO, ...ALLOWED_VIDEO, ...ALLOWED_DOCUMENT];

// Tope duro del multipart. Los topes por tipo (más estrictos) los aplica el
// controlador, que ya sabe si es imagen, video o documento.
export const MAX_SIZE_MB = 64;

export function isAllowedMime(mimetype: string): boolean {
  const mime = normalizeMime(mimetype);
  return mime.startsWith('image/') || ALLOWED_MIME_TYPES.includes(mime);
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${normalizeMime(file.mimetype)}`));
    }
  },
});

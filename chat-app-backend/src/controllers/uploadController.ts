import { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import cloudinary from '../config/cloudinary';
import { normalizeMime } from '../middleware/upload';
import { logger } from '../services/logger';

const log = logger('upload');

function getResourceType(mimetype: string): 'image' | 'video' | 'raw' {
  if (mimetype.startsWith('image/')) return 'image';
  // Cloudinary trata el audio como "video" (mismo pipeline de transcodificación).
  if (mimetype.startsWith('audio/') || mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

// OJO: un video NO es un 'audio'. Antes lo era, y por eso los videos enviados
// desde la web salían como una nota de voz con la onda rota.
function getMessageType(mimetype: string): 'image' | 'audio' | 'video' | 'document' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

// Topes por tipo (el plan gratuito de Cloudinary corta en 10 MB imagen/raw y
// 100 MB video). Devolver un 413 con el motivo es mejor que un 500 de Cloudinary.
const MAX_MB: Record<string, number> = { image: 10, document: 10, audio: 25, video: 64 };

function sanitizeFileName(name: string): string {
  // Preservar la extensión y limpiar caracteres especiales
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${base}${ext}`;
}

const execFileAsync = promisify(execFile);

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Videos por encima de este peso se comprimen con ffmpeg antes de subirlos.
// El video es lo que más ancho de banda consume por reproducción (medido en la
// cuenta real: el 85% del gasto de Cloudinary es TRÁFICO, no almacenamiento), y
// re-codificar a 720p H.264 recorta típicamente el 70-90% del peso.
const COMPRESS_VIDEO_MIN_MB = 10;

// Calidad. CRF 26 es el punto en el que un video de móvil visto a pantalla
// completa se sigue viendo limpio; el 30 de antes emborronaba las escenas con
// movimiento, que es justo lo que se graba en un reel. Cada +6 de CRF ≈ la mitad
// de peso, así que bajar de 30 a 26 sube el archivo ~60% y sigue siendo una
// fracción del original.
const VIDEO_CRF = '26';

/**
 * Comprime un video a H.264 720p (máx. 1280 px en el lado largo).
 *
 * Devuelve el buffer comprimido SOLO si quedó más pequeño que el original; si
 * ffmpeg falla (no instalado, transcode inválido, timeout) o no reduce, devuelve
 * null y el llamador sube el original intacto — la subida nunca se rompe por
 * esto. Lo que SÍ hace ahora es DECIRLO en el log: antes se tragaba el fallo en
 * silencio y no había forma de saber si ffmpeg seguía instalado en el VPS.
 *
 * `-pix_fmt yuv420p` + `profile high` no son adorno: un iPhone graba en HEVC de
 * 10 bits y libx264 heredaría ese formato produciendo un High 10 que **la
 * mayoría de navegadores y teléfonos no reproducen** — el video quedaría en
 * negro justo después de "comprimirlo bien".
 */
async function compressVideo(buffer: Buffer, originalName: string): Promise<Buffer | null> {
  if (buffer.length < COMPRESS_VIDEO_MIN_MB * 1024 * 1024) return null;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-vid-'));
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop()!.toLowerCase() : '';
  const input = path.join(dir, `input${ext}`);
  const output = path.join(dir, 'output.mp4');
  const startedAt = Date.now();
  try {
    await fs.writeFile(input, buffer);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loglevel', 'error',
        '-i', input,
        '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', VIDEO_CRF,
        // Compatibilidad universal: 8 bits, 4:2:0, perfil High.
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.0',
        '-c:a', 'aac',
        '-b:a', '128k',
        // Metadatos fuera (incluida la geolocalización que graba el teléfono),
        // igual que en las imágenes.
        '-map_metadata', '-1',
        '-movflags', '+faststart',
        output,
      ],
      { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const out = await fs.readFile(output);
    const pct = Math.round((1 - out.length / buffer.length) * 100);
    if (out.length >= buffer.length) {
      log.info(`video ya optimizado (${mb(buffer.length)}), se sube el original`);
      return null;
    }
    log.info(`video comprimido ${mb(buffer.length)} -> ${mb(out.length)} (-${pct}%) en ${Date.now() - startedAt} ms`);
    return out;
  } catch (err: any) {
    // ENOENT = ffmpeg no está instalado en la máquina. Es el único caso que hay
    // que arreglar a mano (`apt-get install -y ffmpeg`), y sin este aviso no se
    // distingue de un video que simplemente no se dejó comprimir.
    if (err?.code === 'ENOENT') {
      log.error(`ffmpeg NO está instalado: el video se sube sin comprimir (${mb(buffer.length)}). Instalar con: apt-get install -y ffmpeg`);
    } else {
      log.warn(`no se pudo comprimir el video (${mb(buffer.length)}), se sube el original`, err);
    }
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Imágenes por encima de este peso se optimizan antes de subirlas.
const COMPRESS_IMAGE_MIN_MB = 2;

// Optimiza una imagen SIN pérdida visible: aplica la orientación EXIF, elimina
// los metadatos (EXIF/GPS/cámara) y re-codifica a calidad alta.
// - JPEG → calidad 90 (mozjpeg): visualmente indistinguible, mucho más ligero.
// - PNG  → re-codificado sin pérdida (compresión máxima).
// - Se limita a 2560 px SOLO si es más grande (por encima no se nota en pantalla).
// GIF/HEIC/WebP y otros formatos se suben tal cual (para no romper animaciones
// ni formatos que sharp no procesa igual). Si falla, se sube el original.
async function compressImage(buffer: Buffer, mimetype: string): Promise<Buffer | null> {
  if (buffer.length < COMPRESS_IMAGE_MIN_MB * 1024 * 1024) return null;
  const isJpeg = mimetype === 'image/jpeg';
  const isPng = mimetype === 'image/png';
  if (!isJpeg && !isPng) return null;

  try {
    // Carga perezosa: si sharp no está instalado, `require` lanza y se sube el
    // original intacto (no tumba el backend por una dependencia que falte).
    const sharp: any = require('sharp');
    const base = sharp(buffer)
      .rotate() // aplica la orientación EXIF (y la elimina del resultado)
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true });
    const out = isJpeg
      ? await base.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
      : await base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    return out.length < buffer.length ? out : null;
  } catch {
    return null;
  }
}

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const { buffer, originalname, size } = req.file;
    // El navegador manda "audio/webm;codecs=opus"; sin normalizar, ningún
    // startsWith('audio/') acertaría el resource_type ni el tipo de mensaje.
    const mimetype = normalizeMime(req.file.mimetype);
    const resourceType = getResourceType(mimetype);
    const messageType = getMessageType(mimetype);

    const maxMb = MAX_MB[messageType] ?? 10;
    if (size > maxMb * 1024 * 1024) {
      return res.status(413).json({
        error: `El archivo pesa ${(size / 1024 / 1024).toFixed(1)} MB y el máximo para este tipo es ${maxMb} MB`,
      });
    }

    let safeName = sanitizeFileName(originalname);
    let finalBuffer: Buffer = buffer;
    let finalMimetype = mimetype;

    // Comprimir videos pesados ANTES de subirlos: el "original" que Cloudinary
    // guarda ya llega reducido, que es lo que determina el almacenamiento.
    if (messageType === 'video' && size > COMPRESS_VIDEO_MIN_MB * 1024 * 1024) {
      const compressed = await compressVideo(buffer, safeName);
      if (compressed) {
        finalBuffer = compressed;
        finalMimetype = 'video/mp4';
        // El contenedor pasa a mp4 → ajustar la extensión del public_id.
        safeName = safeName.replace(/\.[^.]+$/, '.mp4');
      }
    }

    // Optimizar imágenes pesadas SIN pérdida visible (quita EXIF y re-codifica
    // a calidad alta). El formato se conserva, así que la extensión no cambia.
    if (messageType === 'image' && size > COMPRESS_IMAGE_MIN_MB * 1024 * 1024) {
      const compressed = await compressImage(buffer, mimetype);
      if (compressed) finalBuffer = compressed;
    }

    // public_id con extensión garantiza que la URL sea abrible directamente
    const publicId = `chat-app/${Date.now()}_${safeName}`;

    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          public_id: publicId,
          use_filename: false,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(finalBuffer);
    });

    // Para archivos raw (documentos), Cloudinary no agrega la extensión al secure_url
    // La agregamos manualmente para que el dispositivo sepa cómo abrirlo
    let url = result.secure_url as string;
    const ext = safeName.includes('.') ? '.' + safeName.split('.').pop()! : '';
    if (resourceType === 'raw' && ext && !url.endsWith(ext)) {
      url = `${url}${ext}`;
    }

    res.json({
      url,
      publicId: result.public_id,
      messageType,
      originalName: originalname,
      size: finalBuffer.length,
      mimeType: finalMimetype,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Error subiendo archivo' });
  }
}

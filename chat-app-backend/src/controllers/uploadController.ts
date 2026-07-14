import { Request, Response } from 'express';
import cloudinary from '../config/cloudinary';
import { normalizeMime } from '../middleware/upload';

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

    const safeName = sanitizeFileName(originalname);
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
      ).end(buffer);
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
      size,
      mimeType: mimetype,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Error subiendo archivo' });
  }
}

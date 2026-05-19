import { Request, Response } from 'express';
import cloudinary from '../config/cloudinary';

function getResourceType(mimetype: string): 'image' | 'video' | 'raw' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/') || mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

function getMessageType(mimetype: string): 'image' | 'audio' | 'document' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/') || mimetype.startsWith('video/')) return 'audio';
  return 'document';
}

function sanitizeFileName(name: string): string {
  // Preservar la extensión y limpiar caracteres especiales
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${base}${ext}`;
}

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const { buffer, mimetype, originalname, size } = req.file;
    const resourceType = getResourceType(mimetype);
    const messageType = getMessageType(mimetype);

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

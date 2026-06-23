import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';

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

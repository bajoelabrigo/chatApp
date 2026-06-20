import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { PrayerRequest } from '../models/PrayerRequest';
import { User } from '../models/User';
import { getIO } from '../socket/ioSingleton';
import { sendPushNotifications } from '../services/pushService';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { isGlobalAdmin } from '../services/adminService';
import { deleteCloudinaryAssets } from '../services/cloudinaryService';

async function assertMember(groupId: string, userId: string): Promise<any | null> {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
}

// Resuelve la conversación de grupo permitiendo al admin general (web role:'admin')
// operar sin ser miembro. Devuelve { conv, globalAdmin }.
async function resolveGroup(groupId: string, userId: string) {
  const globalAdmin = await isGlobalAdmin(userId);
  const conv = globalAdmin
    ? await Conversation.findOne({ _id: groupId, isGroup: true })
    : await assertMember(groupId, userId);
  return { conv, globalAdmin };
}

export async function getPrayerRequests(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    const answered = req.query.answered === 'true';

    const { conv } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const requests = await PrayerRequest.find({ groupId, isAnswered: answered })
      .populate('authorId', 'name avatar')
      .populate('prayingUsers.userId', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    const result = requests.map((r) => ({
      ...r,
      authorId: r.isAnonymous ? null : r.authorId,
      isMyRequest: (r.authorId as any)?._id?.toString() === userId || r.authorId?.toString() === userId,
      isPraying: r.prayingUsers.some((p: any) => p.userId?._id?.toString() === userId || p.userId?.toString() === userId),
      prayingCount: r.prayingUsers.length,
      prayingUsers: r.prayingUsers,
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Error obteniendo peticiones' });
  }
}

export async function createPrayerRequest(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    const { content, isAnonymous, imageUrl, cloudinaryPublicId, deadline } = req.body;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    if (!content?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });

    const request = await PrayerRequest.create({
      groupId,
      authorId: userId,
      content: content.trim(),
      isAnonymous: !!isAnonymous,
      imageUrl: imageUrl ?? undefined,
      cloudinaryPublicId: cloudinaryPublicId ?? undefined,
      deadline: deadline ? new Date(deadline) : undefined,
    });

    const populated = await PrayerRequest.findById(request._id)
      .populate('authorId', 'name avatar')
      .lean();

    const io = getIO();
    if (io) io.to(groupId).emit('prayer:new', { request: populated });

    // Push to all group members with push tokens
    const memberIds = conv.participants.map((p: any) => p.toString()).filter((id: string) => id !== userId);
    const commitments = await ActivityCommitment.find({
      groupId,
      userId: { $in: memberIds },
      expoPushToken: { $exists: true, $ne: null },
    }).distinct('expoPushToken');

    const user = await User.findById(userId).select('name').lean();
    const author = isAnonymous ? 'Alguien en el grupo' : (user?.name ?? 'Alguien');
    sendPushNotifications(
      commitments,
      '📿 Nueva petición de oración',
      `${author}: ${content.trim().slice(0, 80)}`,
      { groupId, screen: 'prayer' }
    );

    res.status(201).json({ ...populated, prayingCount: 0, isPraying: false, isMyRequest: true, prayingUsers: [] });
  } catch {
    res.status(500).json({ error: 'Error creando petición' });
  }
}

export async function deletePrayerRequest(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
    const isAuthor = request.authorId.toString() === userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ error: 'Sin permiso' });

    const prayingUserIds = request.prayingUsers
      .map((p) => p.userId.toString())
      .filter((id) => id !== userId);

    // Limpiar la imagen de Cloudinary de la petición (si tiene) para no dejar
    // assets huérfanos.
    if (request.cloudinaryPublicId) {
      await deleteCloudinaryAssets([
        { publicId: request.cloudinaryPublicId, type: 'image' },
      ]);
    }

    await PrayerRequest.findByIdAndDelete(requestId);
    res.json({ ok: true });

    // Notify participants (fire-and-forget)
    if (prayingUserIds.length > 0) {
      const users = await User.find({
        _id: { $in: prayingUserIds },
        expoPushToken: { $exists: true, $ne: null },
      }).select('expoPushToken').lean();
      const tokens = users.map((u: any) => u.expoPushToken).filter(Boolean) as string[];
      if (tokens.length > 0) {
        sendPushNotifications(tokens, '🗑️ Petición eliminada', 'Una petición por la que estabas orando fue eliminada.', { groupId, screen: 'prayer' });
      }
    }
  } catch {
    res.status(500).json({ error: 'Error eliminando petición' });
  }
}

export async function editPrayerRequest(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;
    const { content, isAnonymous, imageUrl, cloudinaryPublicId, deadline } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
    const isAuthor = request.authorId.toString() === userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ error: 'Sin permiso' });

    const prayingUserIds = request.prayingUsers
      .map((p) => p.userId.toString())
      .filter((id) => id !== userId);

    // Construir la actualización campo a campo. Solo se tocan los campos enviados
    // (compatibilidad con clientes que solo mandan `content`). Para quitar la foto
    // o la fecha el cliente envía `null` explícito.
    const set: Record<string, any> = { content: content.trim() };
    const unset: Record<string, any> = {};

    if (typeof isAnonymous === 'boolean') set.isAnonymous = isAnonymous;

    if (deadline === null || deadline === '') unset.deadline = '';
    else if (deadline !== undefined) set.deadline = new Date(deadline);

    if (imageUrl === null) {
      unset.imageUrl = '';
      unset.cloudinaryPublicId = '';
      // Imagen eliminada → borrar el asset anterior de Cloudinary.
      if (request.cloudinaryPublicId) {
        deleteCloudinaryAssets([{ publicId: request.cloudinaryPublicId, type: 'image' }]);
      }
    } else if (typeof imageUrl === 'string' && imageUrl) {
      set.imageUrl = imageUrl;
      if (cloudinaryPublicId) set.cloudinaryPublicId = cloudinaryPublicId;
      // Imagen reemplazada por otra distinta → borrar la anterior de Cloudinary.
      if (request.cloudinaryPublicId && request.cloudinaryPublicId !== cloudinaryPublicId) {
        deleteCloudinaryAssets([{ publicId: request.cloudinaryPublicId, type: 'image' }]);
      }
    }

    const update: Record<string, any> = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;

    const updated = await PrayerRequest.findByIdAndUpdate(
      requestId,
      update,
      { new: true }
    ).populate('authorId', 'name avatar').populate('prayingUsers.userId', 'name avatar').lean();

    res.json(updated);

    // Notify participants (fire-and-forget)
    if (prayingUserIds.length > 0) {
      const users = await User.find({
        _id: { $in: prayingUserIds },
        expoPushToken: { $exists: true, $ne: null },
      }).select('expoPushToken').lean();
      const tokens = users.map((u: any) => u.expoPushToken).filter(Boolean) as string[];
      if (tokens.length > 0) {
        sendPushNotifications(tokens, '✏️ Petición actualizada', content.trim().slice(0, 80), { groupId, screen: 'prayer' });
      }
    }
  } catch {
    res.status(500).json({ error: 'Error editando petición' });
  }
}

export async function togglePray(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;
    const { message } = req.body;

    if (!await assertMember(groupId, userId)) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const userObjId = new Types.ObjectId(userId);
    const isPraying = request.prayingUsers.some((p) => p.userId.toString() === userId);

    if (isPraying) {
      request.prayingUsers = request.prayingUsers.filter((p) => p.userId.toString() !== userId);
    } else {
      request.prayingUsers.push({ userId: userObjId, prayedAt: new Date(), message: message?.trim() || undefined });
    }
    await request.save();

    const populated = await PrayerRequest.findById(request._id)
      .populate('prayingUsers.userId', 'name avatar')
      .lean();

    const prayingCount = request.prayingUsers.length;
    const prayingUsers = populated?.prayingUsers ?? [];

    const io = getIO();
    if (io) io.to(groupId).emit('prayer:pray', { requestId, userId, prayingCount, prayingUsers });

    res.json({ prayingCount, isPraying: !isPraying, prayingUsers });
  } catch {
    res.status(500).json({ error: 'Error actualizando oración' });
  }
}

export async function getMyActivePrayerRequests(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;

    const requests = await PrayerRequest.find({
      'prayingUsers.userId': userId,
      isAnswered: false,
    })
      .populate('authorId', 'name avatar')
      .populate('groupId', 'groupName')
      .sort({ createdAt: -1 })
      .lean();

    const result = requests.map((r) => ({
      _id: r._id,
      groupId: r.groupId,
      authorId: r.isAnonymous ? null : r.authorId,
      content: r.content,
      isAnonymous: r.isAnonymous,
      imageUrl: r.imageUrl,
      deadline: r.deadline,
      createdAt: r.createdAt,
      prayingCount: r.prayingUsers.length,
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Error obteniendo peticiones' });
  }
}

export async function markAnswered(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;
    const { answeredNote } = req.body;

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
    const isAuthor = request.authorId.toString() === userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ error: 'Sin permiso' });

    const updated = await PrayerRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          isAnswered: true,
          answeredAt: new Date(),
          answeredNote: answeredNote?.trim() ?? '',
        },
      },
      { new: true }
    ).populate('authorId', 'name avatar');

    const io = getIO();
    if (io) io.to(groupId).emit('prayer:answered', { requestId, answeredNote });

    // Push notification to all group members with tokens
    const memberIds = conv.participants.map((p: any) => p.toString());
    const commitments = await ActivityCommitment.find({
      groupId,
      userId: { $in: memberIds },
      expoPushToken: { $exists: true, $ne: null },
    }).distinct('expoPushToken');

    sendPushNotifications(
      commitments,
      '✅ ¡Oración respondida!',
      answeredNote?.trim() ? answeredNote.trim().slice(0, 80) : 'Una petición de oración fue respondida en tu grupo.',
      { groupId, screen: 'prayer' }
    );

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error marcando como respondida' });
  }
}

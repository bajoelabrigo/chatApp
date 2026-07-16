import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { PrayerRequest } from '../models/PrayerRequest';
import { User } from '../models/User';
import { getIO } from '../socket/ioSingleton';
import { sendPushNotifications } from '../services/pushService';
import { sendWebPushToUsers } from '../services/webPushService';
import { isGlobalAdmin } from '../services/adminService';
import { deleteCloudinaryAssets } from '../services/cloudinaryService';
import { createLinkedPost } from '../services/linkedPost';

async function assertMember(groupId: string, userId: string): Promise<any | null> {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
}

/**
 * Tokens de push de los miembros de un grupo.
 *
 * OJO: esto salía de `ActivityCommitment` (los compromisos con actividades del
 * grupo), no de `User`. O sea que una petición de oración nueva solo llegaba a
 * quien YA se había comprometido con alguna actividad de ese grupo — justo los
 * que menos falta hacía avisar. El resto no se enteraba de nada y solo veía la
 * petición si abría el grupo y entraba a la sección de oración por su cuenta.
 * Ese era el motivo real de que "nadie participa", y no la falta de interés.
 *
 * Las actividades (`activityController`) siempre lo hicieron bien, desde `User`:
 * de ahí que la asimetría pasara desapercibida.
 *
 * Respeta la preferencia `notificationSettings.prayerRequests` (ausente = activada),
 * igual que el push web. Antes no la miraba: quien la apagaba en la app seguía
 * recibiendo los avisos igual.
 */
async function groupPushTokens(memberIds: string[]): Promise<string[]> {
  if (!memberIds.length) return [];
  return User.find({
    _id: { $in: memberIds },
    expoPushToken: { $exists: true, $ne: null },
    'notificationSettings.prayerRequests': { $ne: false },
  }).distinct('expoPushToken');
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
    const { content, isAnonymous, imageUrl, cloudinaryPublicId, deadline, shareToFeed } = req.body;

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

    // Push a TODOS los miembros del grupo (antes solo a los que ya tenían
    // compromisos: ver `groupPushTokens`).
    const memberIds = conv.participants.map((p: any) => p.toString()).filter((id: string) => id !== userId);
    const tokens = await groupPushTokens(memberIds);

    const user = await User.findById(userId).select('name').lean();
    const author = isAnonymous ? 'Alguien en el grupo' : (user?.name ?? 'Alguien');
    sendPushNotifications(
      tokens,
      '📿 Nueva petición de oración',
      `${author}: ${content.trim().slice(0, 80)}`,
      { groupId, screen: 'prayer' }
    );

    // 🔔 Web Push (PWA) a los miembros del grupo (ya tenemos sus userIds).
    sendWebPushToUsers(
      memberIds,
      {
        title: '📿 Nueva petición de oración',
        body: `${author}: ${content.trim().slice(0, 80)}`,
        url: '/notifications',
        tag: `prayer-${groupId}`,
        badge: 'prayer',
      },
      'prayerRequests'
    );

    res.status(201).json({ ...populated, prayingCount: 0, isPraying: false, isMyRequest: true, prayingUsers: [] });

    // Post automático en el feed SOLO si: (1) NO es anónima (una anónima no debe
    // exponerse a la comunidad) y (2) el autor lo permitió (`shareToFeed`, por
    // defecto sí). Al pulsar el post lleva al grupo, donde se puede orar y unirse.
    if (!isAnonymous && shareToFeed !== false) {
      const groupName = (conv as any).groupName ?? 'un grupo';
      createLinkedPost({
        authorId: userId,
        type: 'prayer',
        refId: String(request._id),
        groupId,
        groupName,
        groupImage: (conv as any).groupAvatar ?? null,
        title: `Petición de oración · ${groupName}`,
        body: `🙏 ${user?.name ?? 'Alguien'} pide oración en ${groupName}: "${content.trim().slice(0, 140)}"`,
        url: `/g/${groupId}`,
      });
    }
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

// Un pedido de oración activo de algún grupo donde el usuario participa, para el
// popup diario "notificación" (rotación materiales/oración/actividades). Elige
// uno pseudo-aleatorio de los 12 más recientes. Devuelve null si no hay.
export async function getPrayerFeed(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;

    const groups = await Conversation.find({ isGroup: true, participants: userId })
      .select('_id')
      .lean();
    const groupIds = groups.map((g) => g._id);
    if (!groupIds.length) return res.json(null);

    const requests = await PrayerRequest.find({
      groupId: { $in: groupIds },
      isAnswered: false,
    })
      .populate('authorId', 'name avatar')
      .populate('groupId', 'groupName')
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();
    if (!requests.length) return res.json(null);

    const pick = requests[Math.floor(Math.random() * requests.length)] as any;
    res.json({
      _id: pick._id,
      content: pick.content,
      isAnonymous: pick.isAnonymous,
      authorName: pick.isAnonymous ? 'Anónimo' : pick.authorId?.name ?? '',
      groupId: pick.groupId?._id ?? pick.groupId,
      groupName: pick.groupId?.groupName ?? '',
      createdAt: pick.createdAt,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo petición' });
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

    // Push a TODOS los miembros del grupo (antes solo a los que ya tenían
    // compromisos: ver `groupPushTokens`). Una oración respondida es lo que más
    // anima a los demás a orar: era justo lo que no se estaba contando.
    const memberIds = conv.participants.map((p: any) => p.toString());
    const tokens = await groupPushTokens(memberIds);

    sendPushNotifications(
      tokens,
      '✅ ¡Oración respondida!',
      answeredNote?.trim() ? answeredNote.trim().slice(0, 80) : 'Una petición de oración fue respondida en tu grupo.',
      { groupId, screen: 'prayer' }
    );

    res.json(updated);

    // Testimonio en el feed: una oración respondida es lo más animante y lo menos
    // sensible (la respuesta, no la súplica). Solo si la petición NO era anónima,
    // para no revelar al autor de una anónima. Al pulsar, lleva al grupo.
    if (!request.isAnonymous) {
      const groupName = (conv as any).groupName ?? 'un grupo';
      const note = answeredNote?.trim();
      createLinkedPost({
        authorId: request.authorId.toString(),
        type: 'answered',
        refId: String(request._id),
        groupId,
        groupName,
        groupImage: (conv as any).groupAvatar ?? null,
        title: `Oración respondida · ${groupName}`,
        body: note
          ? `🎉 ¡Oración respondida en ${groupName}! "${note.slice(0, 200)}"`
          : `🎉 ¡Una oración fue respondida en ${groupName}! Gloria a Dios.`,
        url: `/g/${groupId}`,
      });
    }
  } catch {
    res.status(500).json({ error: 'Error marcando como respondida' });
  }
}

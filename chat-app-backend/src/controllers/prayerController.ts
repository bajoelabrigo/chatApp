import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { PrayerRequest } from '../models/PrayerRequest';
import { User } from '../models/User';
import { getIO } from '../socket/ioSingleton';
import { sendPushNotifications } from '../services/pushService';
import { ActivityCommitment } from '../models/ActivityCommitment';

async function assertMember(groupId: string, userId: string): Promise<any | null> {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
}

export async function getPrayerRequests(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    const answered = req.query.answered === 'true';

    if (!await assertMember(groupId, userId)) return res.status(404).json({ error: 'Grupo no encontrado' });

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
    const { content, isAnonymous } = req.body;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    if (!content?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });

    const request = await PrayerRequest.create({
      groupId,
      authorId: userId,
      content: content.trim(),
      isAnonymous: !!isAnonymous,
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

    res.status(201).json({ ...populated, prayingCount: 0, isPraying: false, isMyRequest: true });
  } catch {
    res.status(500).json({ error: 'Error creando petición' });
  }
}

export async function deletePrayerRequest(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
    const isAuthor = request.authorId.toString() === userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ error: 'Sin permiso' });

    await PrayerRequest.findByIdAndDelete(requestId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando petición' });
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

export async function markAnswered(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, requestId } = req.params;
    const { answeredNote } = req.body;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const request = await PrayerRequest.findOne({ _id: requestId, groupId });
    if (!request) return res.status(404).json({ error: 'Petición no encontrada' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
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

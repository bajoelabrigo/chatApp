import { Request, Response } from 'express';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { Report } from '../models/Report';
import { AuthRequest } from '../middleware/authMiddleware';

export async function getBlockedUsers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const user = await User.findById(userId)
      .populate('blockedUsers', 'name avatar email')
      .lean();
    res.json(user?.blockedUsers ?? []);
  } catch {
    res.status(500).json({ error: 'Error obteniendo usuarios bloqueados' });
  }
}

export async function getAllMyCommitments(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const commitments = await ActivityCommitment.find({ userId, isActive: true })
      .populate('activityId', 'name emoji type')
      .populate('groupId', 'groupName')
      .lean();
    res.json(commitments);
  } catch {
    res.status(500).json({ error: 'Error obteniendo compromisos' });
  }
}

export async function updatePushToken(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { expoPushToken } = req.body;
    await User.findByIdAndUpdate(userId, { expoPushToken: expoPushToken ?? null });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error actualizando token' });
  }
}

export async function getUserProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const myId = req.userId!;
    const { userId } = req.params;

    const targetUser = await User.findById(userId).select('name email avatar').lean();
    if (!targetUser) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const sharedGroups = await Conversation.find({
      isGroup: true,
      participants: { $all: [myId, userId] },
    }).select('groupName groupAvatar participants').lean();

    const me = await User.findById(myId).select('blockedUsers').lean();
    const isBlocked = me?.blockedUsers?.some((id) => id.toString() === userId) ?? false;

    res.json({
      _id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      avatar: targetUser.avatar,
      sharedGroups: sharedGroups.map((g) => ({
        _id: g._id,
        groupName: g.groupName,
        groupAvatar: g.groupAvatar,
        participantCount: (g.participants as any[]).length,
      })),
      isBlocked,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

export async function reportUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const myId = req.userId!;
    const { userId } = req.params;
    const { reason } = req.body;

    if (userId === myId) { res.status(400).json({ error: 'No puedes reportarte a ti mismo' }); return; }

    await Report.create({ reporterId: myId, targetId: userId, targetType: 'user', reason: reason ?? '' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error enviando reporte' });
  }
}

export async function toggleBlock(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { targetUserId } = req.params;

    if (targetUserId === userId) {
      return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
    }

    const currentUser = await User.findById(userId).select('blockedUsers');
    if (!currentUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isBlocked = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    await User.findByIdAndUpdate(
      userId,
      isBlocked
        ? { $pull: { blockedUsers: targetUserId } }
        : { $addToSet: { blockedUsers: targetUserId } }
    );

    // Sync conversation archive state with block state
    const conversation = await Conversation.findOne({
      participants: { $all: [userId, targetUserId], $size: 2 },
    });

    if (conversation) {
      await Conversation.findByIdAndUpdate(
        conversation._id,
        isBlocked
          ? { $pull: { archivedBy: userId } }
          : { $addToSet: { archivedBy: userId } }
      );
    }

    res.json({ blocked: !isBlocked });
  } catch {
    res.status(500).json({ error: 'Error al bloquear/desbloquear usuario' });
  }
}

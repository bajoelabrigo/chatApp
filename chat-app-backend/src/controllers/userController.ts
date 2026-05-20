import { Request, Response } from 'express';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { ActivityCommitment } from '../models/ActivityCommitment';

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

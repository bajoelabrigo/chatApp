import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { PrayerRequest } from '../models/PrayerRequest';
import { GroupActivity } from '../models/GroupActivity';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { isGlobalAdmin } from '../services/adminService';

// Devuelve todo el contenido de un usuario en el dominio chat (grupos a los que
// pertenece, peticiones de oración que creó y actividades que creó), para que el
// admin general lo revise y elimine selectivamente desde la lista de usuarios web.
// La eliminación se hace con los endpoints existentes (DELETE /groups/:id, etc.),
// que ya permiten al admin general por el bypass de `isGlobalAdmin`.
export async function getUserContent(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general puede ver esto' });
    }

    const { userId } = req.params;

    const [user, groups, prayers, activities, messagesSent, commitmentsCount] =
      await Promise.all([
        User.findById(userId)
          .select(
            'name email avatar bio authProvider emailVerified lastSeen lastLogin createdAt isActiveSubscriber role expoPushToken'
          )
          .lean(),
        Conversation.find({ isGroup: true, participants: userId })
          .select('groupName groupAvatar admins participants')
          .lean(),
        PrayerRequest.find({ authorId: userId })
          .populate('groupId', 'groupName')
          .select('content groupId isAnswered isAnonymous createdAt')
          .sort({ createdAt: -1 })
          .lean(),
        GroupActivity.find({ createdBy: userId })
          .populate('groupId', 'groupName')
          .select('name emoji type groupId isActive createdAt')
          .sort({ createdAt: -1 })
          .lean(),
        Message.countDocuments({ senderId: userId }),
        ActivityCommitment.countDocuments({ userId, isActive: true }),
      ]);

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const u: any = user;

    res.json({
      user: {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar || u.profilePicture,
        bio: u.bio,
        authProvider: u.authProvider,
        emailVerified: u.emailVerified,
        role: u.role,
        isActiveSubscriber: u.isActiveSubscriber,
        hasPushToken: !!u.expoPushToken,
        lastSeen: u.lastSeen,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt,
      },
      stats: {
        groups: groups.length,
        prayers: prayers.length,
        activities: activities.length,
        messagesSent,
        commitments: commitmentsCount,
      },
      groups: groups.map((g: any) => ({
        _id: g._id,
        groupName: g.groupName,
        groupAvatar: g.groupAvatar,
        memberCount: g.participants?.length ?? 0,
        isUserAdmin: (g.admins ?? []).some((a: any) => a.toString() === userId),
      })),
      prayers: prayers.map((p: any) => ({
        _id: p._id,
        content: p.content,
        groupId: p.groupId?._id ?? p.groupId,
        groupName: p.groupId?.groupName ?? 'Grupo',
        isAnswered: p.isAnswered,
        isAnonymous: p.isAnonymous,
        createdAt: p.createdAt,
      })),
      activities: activities.map((a: any) => ({
        _id: a._id,
        name: a.name,
        emoji: a.emoji,
        type: a.type,
        groupId: a.groupId?._id ?? a.groupId,
        groupName: a.groupId?.groupName ?? 'Grupo',
        isActive: a.isActive,
      })),
    });
  } catch (err) {
    console.error('[admin] getUserContent error', err);
    res.status(500).json({ error: 'Error obteniendo contenido del usuario' });
  }
}

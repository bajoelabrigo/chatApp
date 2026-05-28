import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User, INotificationSettings, IPrivacySettings } from '../models/User';
import { Conversation } from '../models/Conversation';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PersonalCommitment } from '../models/PersonalCommitment';
import { PrayerRequest } from '../models/PrayerRequest';
import { GroupActivity } from '../models/GroupActivity';
import { Message } from '../models/Message';
import { Report } from '../models/Report';
import { AuthRequest } from '../middleware/authMiddleware';
import { deleteCloudinaryAsset, deleteCloudinaryAssets } from '../services/cloudinaryService';
import { sendAccountDeletedEmail } from '../services/emailService';

function extractCloudinaryPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function getMySettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId).select('notificationSettings privacySettings').lean();
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({
      notificationSettings: user.notificationSettings ?? { messages: true, prayerRequests: true, activityReminders: true },
      privacySettings: user.privacySettings ?? { showOnlineStatus: true, showReadReceipts: true, showLastSeen: true },
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo ajustes' });
  }
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { notificationSettings, privacySettings } = req.body as {
      notificationSettings?: Partial<INotificationSettings>;
      privacySettings?: Partial<IPrivacySettings>;
    };

    const updates: Record<string, any> = {};
    if (notificationSettings) {
      const keys: (keyof INotificationSettings)[] = ['messages', 'prayerRequests', 'activityReminders'];
      keys.forEach((k) => {
        if (typeof notificationSettings[k] === 'boolean') {
          updates[`notificationSettings.${k}`] = notificationSettings[k];
        }
      });
    }
    if (privacySettings) {
      const keys: (keyof IPrivacySettings)[] = ['showOnlineStatus', 'showReadReceipts', 'showLastSeen'];
      keys.forEach((k) => {
        if (typeof privacySettings[k] === 'boolean') {
          updates[`privacySettings.${k}`] = privacySettings[k];
        }
      });
    }

    const updated = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('notificationSettings privacySettings').lean();
    if (!updated) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    res.json({
      notificationSettings: updated.notificationSettings,
      privacySettings: updated.privacySettings,
    });
  } catch {
    res.status(500).json({ error: 'Error actualizando ajustes' });
  }
}

export async function getMyProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId).select('name email avatar bio authProvider createdAt').lean();
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({
      id: (user._id as any).toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio ?? '',
      authProvider: user.authProvider,
      createdAt: (user as any).createdAt,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

export async function updateMyProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { name, bio, avatar } = req.body as { name?: string; bio?: string; avatar?: string };

    const updates: Record<string, any> = {};
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) { res.status(400).json({ error: 'El nombre no puede estar vacío' }); return; }
      updates.name = trimmed;
    }
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 150);
    if (avatar !== undefined) updates.avatar = avatar;

    const updated = await User.findByIdAndUpdate(userId, updates, { new: true })
      .select('name email avatar bio').lean();
    if (!updated) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    res.json({
      id: (updated._id as any).toString(),
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar,
      bio: updated.bio ?? '',
    });
  } catch {
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
}

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

    const targetUser = await User.findById(userId).select('name email avatar bio').lean();
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
      bio: targetUser.bio ?? '',
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

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    const user = await User.findById(userId).select('authProvider password');
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    if (user.authProvider === 'google') {
      res.status(400).json({ error: 'Tu cuenta usa Google Sign-In. No puedes cambiar la contraseña desde aquí.' });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const match = await bcrypt.compare(currentPassword, user.password ?? '');
    if (!match) { res.status(400).json({ error: 'La contraseña actual es incorrecta' }); return; }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch {
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
}

export async function deleteAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    // 1. Obtener datos del usuario antes de borrar (necesarios para el email y Cloudinary)
    const userDoc = await User.findById(userId).select('avatar email name').lean();
    if (userDoc?.avatar) {
      const publicId = extractCloudinaryPublicId(userDoc.avatar);
      if (publicId) await deleteCloudinaryAsset(publicId, 'image');
    }

    // 2. Compromisos y actividades propias
    await ActivityCommitment.deleteMany({ userId });
    await PersonalCommitment.deleteMany({ userId });
    await PrayerRequest.deleteMany({ authorId: userId });
    await GroupActivity.deleteMany({ createdBy: userId });

    // 3. Conversaciones 1:1: borrar media de Cloudinary + mensajes + conversación
    const directConvs = await Conversation.find({
      isGroup: false,
      participants: userId,
    }).select('_id').lean();
    const directIds = directConvs.map((c) => c._id);
    if (directIds.length > 0) {
      const directMedia = await Message.find({
        conversationId: { $in: directIds },
        cloudinaryPublicId: { $exists: true, $ne: null },
        type: { $in: ['image', 'audio', 'document'] },
      }).select('cloudinaryPublicId type').lean();
      if (directMedia.length > 0) {
        await deleteCloudinaryAssets(
          directMedia.map((m) => ({ publicId: m.cloudinaryPublicId!, type: m.type as any }))
        );
      }
      await Message.deleteMany({ conversationId: { $in: directIds } });
      await Conversation.deleteMany({ _id: { $in: directIds } });
    }

    // 4. Mensajes del usuario en grupos → borrar solo su media de Cloudinary
    const groupMedia = await Message.find({
      senderId: userId,
      conversationId: { $nin: directIds },
      cloudinaryPublicId: { $exists: true, $ne: null },
      type: { $in: ['image', 'audio', 'document'] },
    }).select('cloudinaryPublicId type').lean();
    if (groupMedia.length > 0) {
      await deleteCloudinaryAssets(
        groupMedia.map((m) => ({ publicId: m.cloudinaryPublicId!, type: m.type as any }))
      );
    }

    // 5. Grupos: sacar al usuario de participantes (mensajes permanecen en el historial)
    await Conversation.updateMany(
      { isGroup: true, participants: userId },
      { $pull: { participants: userId, admins: userId, archivedBy: userId, mutedBy: userId, pinnedBy: userId, favoritedBy: userId } }
    );

    // 6. Enviar email de confirmación antes de borrar el documento
    if (userDoc?.email) {
      await sendAccountDeletedEmail(userDoc.email, userDoc.name ?? 'Usuario');
    }

    // 7. Borrar el documento del usuario
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Cuenta eliminada correctamente' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la cuenta' });
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

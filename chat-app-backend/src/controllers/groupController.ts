import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Report } from '../models/Report';
import { getIO } from '../socket/ioSingleton';
import { deleteCloudinaryAssets } from '../services/cloudinaryService';

function buildGroupResult(conv: any, userId: string) {
  return {
    ...conv,
    isGroup: true,
    isPinned: (conv.pinnedBy ?? []).some((id: any) => id.toString() === userId),
    isArchived: (conv.archivedBy ?? []).some((id: any) => id.toString() === userId),
    isFavorite: (conv.favoritedBy ?? []).some((id: any) => id.toString() === userId),
    isBlocked: false,
  };
}

export async function createGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { name, participantIds, permissions, tempMessageDuration } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'El nombre del grupo es requerido' });
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'El grupo debe tener al menos un miembro' });
    }

    const allParticipants = [userId, ...participantIds.filter((id: string) => id !== userId)];

    const conv = await Conversation.create({
      isGroup: true,
      groupName: name.trim(),
      participants: allParticipants,
      admins: [userId],
      permissions: {
        membersCanSend: permissions?.membersCanSend ?? true,
        membersCanAddMembers: permissions?.membersCanAddMembers ?? true,
        membersCanInvite: permissions?.membersCanInvite ?? true,
        requireAdminApproval: permissions?.requireAdminApproval ?? false,
      },
      tempMessageDuration: tempMessageDuration ?? null,
    });

    const populated = await Conversation.findById(conv._id)
      .populate('participants', 'name avatar email')
      .lean();

    const result = buildGroupResult(populated, userId);

    // Notify other participants via their personal socket rooms
    const io = getIO();
    if (io) {
      for (const participantId of allParticipants) {
        if (participantId !== userId) {
          io.to(`user:${participantId}`).emit('group:new', result);
        }
      }
    }

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando grupo' });
  }
}

export async function updateGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { name, permissions, tempMessageDuration } = req.body;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden editar el grupo' });

    const update: Record<string, any> = {};
    if (name?.trim()) update.groupName = name.trim();
    if (permissions !== undefined) {
      const cur = conv.permissions as any;
      update.permissions = {
        membersCanSend: permissions.membersCanSend ?? cur.membersCanSend,
        membersCanAddMembers: permissions.membersCanAddMembers ?? cur.membersCanAddMembers,
        membersCanInvite: permissions.membersCanInvite ?? cur.membersCanInvite,
        requireAdminApproval: permissions.requireAdminApproval ?? cur.requireAdminApproval,
      };
    }
    if (tempMessageDuration !== undefined) update.tempMessageDuration = tempMessageDuration;

    const updated = await Conversation.findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate('participants', 'name avatar email')
      .lean();

    const io = getIO();
    if (io) {
      io.to(id).emit('group:updated', updated);
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error actualizando grupo' });
  }
}

export async function addGroupMembers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { memberIds } = req.body;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin && !conv.permissions.membersCanAddMembers) {
      return res.status(403).json({ error: 'No tienes permiso para añadir miembros' });
    }

    await Conversation.findByIdAndUpdate(id, {
      $addToSet: { participants: { $each: memberIds } },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error añadiendo miembros' });
  }
}

export async function removeGroupMember(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id, memberId } = req.params;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a) => a.toString() === userId);
    const isSelf = memberId === userId;
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'No tienes permiso' });

    await Conversation.findByIdAndUpdate(id, { $pull: { participants: memberId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando miembro' });
  }
}

export async function getGroupInfo(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId })
      .populate('participants', 'name avatar email')
      .lean();

    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = (conv.admins ?? []).some((a: any) => a.toString() === userId);

    res.json({
      ...conv,
      isAdmin,
      isPinned: (conv.pinnedBy ?? []).some((pid: any) => pid.toString() === userId),
      isArchived: (conv.archivedBy ?? []).some((pid: any) => pid.toString() === userId),
      isFavorite: (conv.favoritedBy ?? []).some((pid: any) => pid.toString() === userId),
      isBlocked: false,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo info del grupo' });
  }
}

export async function deleteGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden eliminar el grupo' });

    // Collect all media messages that have a Cloudinary asset
    const mediaMessages = await Message.find(
      { conversationId: id, type: { $ne: 'text' }, cloudinaryPublicId: { $exists: true, $ne: null } },
      { type: 1, cloudinaryPublicId: 1 }
    ).lean();

    // Notify members BEFORE deleting so their socket room is still valid
    const io = getIO();
    if (io) io.to(id).emit('group:deleted', { groupId: id });

    // Purge Cloudinary assets and DB records in parallel
    await Promise.all([
      deleteCloudinaryAssets(
        mediaMessages.map((m) => ({ publicId: m.cloudinaryPublicId!, type: m.type as any }))
      ),
      Message.deleteMany({ conversationId: id }),
      Conversation.findByIdAndDelete(id),
      Report.deleteMany({ targetId: id }),
    ]);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando grupo' });
  }
}

export async function leaveGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const conv = await Conversation.findOne({ _id: id, isGroup: true, participants: userId });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    // If last admin is leaving and there are other members, promote the next participant
    const isAdmin = conv.admins.some((a) => a.toString() === userId);
    const remainingAdmins = conv.admins.filter((a) => a.toString() !== userId);
    const remainingMembers = conv.participants.filter((p) => p.toString() !== userId);

    const update: any = {
      $pull: { participants: userId, admins: userId },
    };

    if (isAdmin && remainingAdmins.length === 0 && remainingMembers.length > 0) {
      // Promote first remaining member to admin
      update.$addToSet = { admins: remainingMembers[0] };
    }

    await Conversation.findByIdAndUpdate(id, update);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al salir del grupo' });
  }
}

export async function reportGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { reason } = req.body;

    const exists = await Conversation.exists({ _id: id, isGroup: true });
    if (!exists) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Prevent duplicate reports from same user
    const existing = await Report.findOne({ reporterId: userId, targetId: id });
    if (existing) return res.status(409).json({ error: 'Ya reportaste este grupo' });

    await Report.create({ reporterId: userId, targetId: id, targetType: 'group', reason: reason ?? '' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al reportar grupo' });
  }
}

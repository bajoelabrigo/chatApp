import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';
import { Message } from '../models/Message';
import { sendGroupJoinApproved } from '../services/emailService';
import { Report } from '../models/Report';
import { GroupActivity } from '../models/GroupActivity';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PrayerRequest } from '../models/PrayerRequest';
import { getIO } from '../socket/ioSingleton';
import { deleteCloudinaryAssets, deleteCloudinaryUrls } from '../services/cloudinaryService';
import { isGlobalAdmin } from '../services/adminService';

// Resuelve el grupo permitiendo al admin general (web role:'admin') operar sin
// ser miembro ni admin del grupo. Devuelve { conv, globalAdmin }.
async function resolveGroup(groupId: string, userId: string) {
  const globalAdmin = await isGlobalAdmin(userId);
  const conv = globalAdmin
    ? await Conversation.findOne({ _id: groupId, isGroup: true })
    : await Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
  return { conv, globalAdmin };
}

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
    const { name, permissions, tempMessageDuration, groupAvatar } = req.body;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden editar el grupo' });

    const update: Record<string, any> = {};
    if (name?.trim()) update.groupName = name.trim();
    if (groupAvatar !== undefined) {
      update.groupAvatar = groupAvatar;
      // Si se cambia o elimina el avatar, borrar el anterior de Cloudinary.
      if (conv.groupAvatar && conv.groupAvatar !== groupAvatar) {
        deleteCloudinaryUrls([conv.groupAvatar]);
      }
    }
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

// Media compartida del grupo para el panel "Archivos, enlaces y docs":
//  - files: fotos/videos/audios (type image|audio)
//  - docs:  documentos (type document)
//  - links: URLs encontradas en mensajes de texto
const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;

export async function getGroupMedia(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const { conv } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Solo mensajes vivos (no borrados para todos ni para este usuario).
    const baseFilter = {
      conversationId: id,
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: userId },
    };

    const [mediaMessages, textMessages] = await Promise.all([
      Message.find(
        { ...baseFilter, type: { $in: ['image', 'audio', 'document'] } },
        { type: 1, content: 1, fileName: 1, fileSize: 1, senderId: 1, createdAt: 1 }
      )
        .sort({ createdAt: -1 })
        .lean(),
      Message.find(
        { ...baseFilter, type: 'text', content: /https?:\/\//i },
        { content: 1, senderId: 1, createdAt: 1 }
      )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const files: any[] = [];
    const docs: any[] = [];
    for (const m of mediaMessages) {
      const entry = {
        _id: m._id,
        url: m.content,
        type: m.type,
        fileName: m.fileName,
        fileSize: m.fileSize,
        createdAt: m.createdAt,
      };
      if (m.type === 'document') docs.push(entry);
      else files.push(entry);
    }

    const links: any[] = [];
    for (const m of textMessages) {
      const found = (m.content || '').match(URL_REGEX) || [];
      for (const url of found) {
        links.push({ _id: m._id, url, createdAt: m.createdAt });
      }
    }

    res.json({ files, docs, links });
  } catch (err) {
    console.error('getGroupMedia error:', err);
    res.status(500).json({ error: 'Error obteniendo archivos del grupo' });
  }
}

export async function addGroupMembers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { memberIds } = req.body;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin && !conv.permissions.membersCanAddMembers) {
      return res.status(403).json({ error: 'No tienes permiso para añadir miembros' });
    }

    await Conversation.findByIdAndUpdate(id, {
      $addToSet: { participants: { $each: memberIds } },
    });

    // Notify newly added members so they join the socket room in real-time
    const updated = await Conversation.findById(id)
      .populate('participants', 'name avatar email')
      .lean();
    if (updated) {
      const io = getIO();
      const result = buildGroupResult(updated, userId);
      if (io) {
        for (const newMemberId of memberIds) {
          io.to(`user:${newMemberId}`).emit('group:new', result);
        }
      }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error añadiendo miembros' });
  }
}

export async function toggleAdmin(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id, memberId } = req.params;

    const globalAdmin = await isGlobalAdmin(userId);
    const conv = globalAdmin
      ? await Conversation.findOne({ _id: id, isGroup: true })
      : await Conversation.findOne({ _id: id, isGroup: true, admins: userId });
    if (!conv) { res.status(403).json({ error: 'Solo los admins pueden cambiar roles' }); return; }

    const isCurrentlyAdmin = conv.admins.some((a) => a.toString() === memberId);
    if (isCurrentlyAdmin) {
      await Conversation.findByIdAndUpdate(id, { $pull: { admins: memberId } });
    } else {
      await Conversation.findByIdAndUpdate(id, { $addToSet: { admins: memberId } });
    }

    res.json({ isAdmin: !isCurrentlyAdmin });
  } catch {
    res.status(500).json({ error: 'Error cambiando rol' });
  }
}

export async function removeGroupMember(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id, memberId } = req.params;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
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

    const globalAdmin = await isGlobalAdmin(userId);
    const conv = await Conversation.findOne(
      globalAdmin
        ? { _id: id, isGroup: true }
        : { _id: id, isGroup: true, participants: userId }
    )
      .populate('participants', 'name avatar email')
      .lean();

    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || (conv.admins ?? []).some((a: any) => a.toString() === userId);

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

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden eliminar el grupo' });

    // Collect Cloudinary assets from messages AND prayer request images
    const [mediaMessages, prayerImages] = await Promise.all([
      Message.find(
        { conversationId: id, type: { $ne: 'text' }, cloudinaryPublicId: { $exists: true, $ne: null } },
        { type: 1, cloudinaryPublicId: 1 }
      ).lean(),
      PrayerRequest.find(
        { groupId: id, cloudinaryPublicId: { $exists: true, $ne: null } },
        { cloudinaryPublicId: 1 }
      ).lean(),
    ]);

    // Notify members BEFORE deleting so their socket room is still valid
    const io = getIO();
    if (io) io.to(id).emit('group:deleted', { groupId: id });

    // Full cascade: messages, prayers, activities, commitments, conversation, reports + Cloudinary
    await Promise.all([
      deleteCloudinaryAssets([
        ...mediaMessages.map((m) => ({ publicId: m.cloudinaryPublicId!, type: m.type as any })),
        ...prayerImages.map((p) => ({ publicId: p.cloudinaryPublicId!, type: 'image' as const })),
      ]),
      // El avatar del grupo solo guarda la URL (sin publicId) → derivarlo de la URL.
      deleteCloudinaryUrls([conv.groupAvatar]),
      Message.deleteMany({ conversationId: id }),
      PrayerRequest.deleteMany({ groupId: id }),
      GroupActivity.deleteMany({ groupId: id }),
      ActivityCommitment.deleteMany({ groupId: id }),
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

// Unirse a un grupo mediante un enlace compartido (/g/:id). Cualquier usuario
// autenticado con el enlace puede unirse; el _id del grupo actúa como "invitación".
// Si el grupo exige aprobación (requireAdminApproval), la solicitud queda
// pendiente y el admin debe aceptarla.
export async function joinGroup(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const conv = await Conversation.findOne({ _id: id, isGroup: true });
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const alreadyMember = conv.participants.some((p) => p.toString() === userId);

    // Grupo con aprobación previa: no unir directamente, encolar la solicitud.
    if (!alreadyMember && conv.permissions?.requireAdminApproval) {
      const alreadyPending = (conv.pendingMembers ?? []).some(
        (pm: any) => pm.userId?.toString() === userId
      );
      if (!alreadyPending) {
        await Conversation.updateOne(
          { _id: id, 'pendingMembers.userId': { $ne: userId } },
          { $push: { pendingMembers: { userId, requestedAt: new Date() } } }
        );
        // Avisar a los admins (barra de alerta en tiempo real).
        const io = getIO();
        if (io) {
          for (const adminId of conv.admins) {
            io.to(`user:${adminId.toString()}`).emit('group:pending', { groupId: id });
          }
        }
      }
      return res.status(202).json({ pending: true, alreadyPending, groupName: conv.groupName });
    }

    if (!alreadyMember) {
      await Conversation.findByIdAndUpdate(id, { $addToSet: { participants: userId } });
    }

    const updated = await Conversation.findById(id)
      .populate('participants', 'name avatar email')
      .lean();
    if (!updated) return res.status(404).json({ error: 'Grupo no encontrado' });

    const result = buildGroupResult(updated, userId);

    const io = getIO();
    if (io) {
      // El que se une entra a su lista de chats en tiempo real…
      io.to(`user:${userId}`).emit('group:new', result);
      // …y, si es nuevo miembro, se une a la room y se avisa a los demás.
      if (!alreadyMember) {
        io.in(`user:${userId}`).socketsJoin(id);
        io.to(id).emit('group:updated', updated);
      }
    }

    res.status(alreadyMember ? 200 : 201).json({ ...result, alreadyMember });
  } catch {
    res.status(500).json({ error: 'Error al unirse al grupo' });
  }
}

// Lista de solicitudes de ingreso pendientes (solo admins del grupo / admin general).
export async function getPendingMembers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden ver las solicitudes' });

    const populated = await Conversation.findById(id)
      .select('pendingMembers')
      .populate('pendingMembers.userId', 'name avatar email')
      .lean();

    const pending = (populated?.pendingMembers ?? [])
      .filter((pm: any) => pm.userId) // por si el usuario fue borrado
      .map((pm: any) => ({
        _id: pm.userId._id,
        name: pm.userId.name,
        avatar: pm.userId.avatar,
        email: pm.userId.email,
        requestedAt: pm.requestedAt,
      }));

    res.json(pending);
  } catch {
    res.status(500).json({ error: 'Error obteniendo solicitudes' });
  }
}

// Aprobar una solicitud: mover de pendingMembers a participants + notificar.
export async function approvePendingMember(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id, memberId } = req.params;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden aprobar' });

    const isPending = (conv.pendingMembers ?? []).some(
      (pm: any) => pm.userId?.toString() === memberId
    );
    if (!isPending) return res.status(404).json({ error: 'La solicitud ya no existe' });

    await Conversation.findByIdAndUpdate(id, {
      $pull: { pendingMembers: { userId: memberId }, approvedMembers: { userId: memberId } },
      $addToSet: { participants: memberId },
    });
    // Registrar la aprobación (para la notificación derivada "fuiste aceptado").
    await Conversation.findByIdAndUpdate(id, {
      $push: { approvedMembers: { userId: memberId, at: new Date() } },
    });

    const updated = await Conversation.findById(id)
      .populate('participants', 'name avatar email')
      .lean();

    const io = getIO();
    if (io && updated) {
      const result = buildGroupResult(updated, memberId);
      io.to(`user:${memberId}`).emit('group:new', result);
      io.in(`user:${memberId}`).socketsJoin(id);
      io.to(id).emit('group:updated', updated);
      // Refrescar la barra de solicitudes de los admins.
      for (const adminId of conv.admins) {
        io.to(`user:${adminId.toString()}`).emit('group:pending', { groupId: id });
      }
    }

    // Email de bienvenida (best-effort, no bloquea la respuesta).
    const member = await User.findById(memberId).select('name email').lean();
    if (member?.email) {
      sendGroupJoinApproved(member.email, member.name || 'Hermano(a)', conv.groupName || 'el grupo');
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error aprobando la solicitud' });
  }
}

// Rechazar una solicitud: quitarla de pendingMembers.
export async function rejectPendingMember(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id, memberId } = req.params;

    const { conv, globalAdmin } = await resolveGroup(id, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden rechazar' });

    await Conversation.findByIdAndUpdate(id, {
      $pull: { pendingMembers: { userId: memberId } },
    });

    const io = getIO();
    if (io) {
      for (const adminId of conv.admins) {
        io.to(`user:${adminId.toString()}`).emit('group:pending', { groupId: id });
      }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error rechazando la solicitud' });
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

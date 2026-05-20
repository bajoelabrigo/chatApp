import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { GroupActivity, ACTIVITY_META, ActivityType } from '../models/GroupActivity';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { User } from '../models/User';
import { getIO } from '../socket/ioSingleton';
import { sendCommitmentConfirmation } from '../services/emailService';
import { sendPushNotification } from '../services/pushService';

async function assertMember(groupId: string, userId: string): Promise<any | null> {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
}

export async function getActivities(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    if (!await assertMember(groupId, userId)) return res.status(404).json({ error: 'Grupo no encontrado' });

    const activities = await GroupActivity.find({ groupId, isActive: true }).lean();

    // Attach committed count per activity
    const counts = await ActivityCommitment.aggregate([
      { $match: { groupId: require('mongoose').Types.ObjectId.createFromHexString(groupId), isActive: true } },
      { $group: { _id: '$activityId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const myCommitments = await ActivityCommitment.find({ groupId, userId, isActive: true }).select('activityId schedule').lean();
    const myMap = new Map(myCommitments.map((c) => [c.activityId.toString(), c.schedule]));

    const result = activities.map((a) => ({
      ...a,
      committedCount: countMap.get(a._id.toString()) ?? 0,
      mySchedule: myMap.get(a._id.toString()) ?? null,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo actividades' });
  }
}

export async function createActivity(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    const { type, name, description } = req.body;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden crear actividades' });

    if (!type || !ACTIVITY_META[type as ActivityType]) {
      return res.status(400).json({ error: 'Tipo de actividad inválido' });
    }

    const meta = ACTIVITY_META[type as ActivityType];
    const activity = await GroupActivity.create({
      groupId,
      createdBy: userId,
      type,
      emoji: meta.emoji,
      name: name?.trim() || meta.defaultName,
      description: description?.trim(),
    });

    const io = getIO();
    if (io) io.to(groupId).emit('activity:created', { activity });

    res.status(201).json(activity);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: 'Ya existe una actividad de este tipo en el grupo' });
    console.error(err);
    res.status(500).json({ error: 'Error creando actividad' });
  }
}

export async function updateActivity(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, activityId } = req.params;
    const { name, description, isActive } = req.body;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden editar actividades' });

    const update: Record<string, any> = {};
    if (name?.trim()) update.name = name.trim();
    if (description !== undefined) update.description = description?.trim() ?? '';
    if (isActive !== undefined) update.isActive = isActive;

    const updated = await GroupActivity.findOneAndUpdate(
      { _id: activityId, groupId },
      { $set: update },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Actividad no encontrada' });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error actualizando actividad' });
  }
}

export async function deleteActivity(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, activityId } = req.params;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden eliminar actividades' });

    await Promise.all([
      GroupActivity.findOneAndDelete({ _id: activityId, groupId }),
      ActivityCommitment.deleteMany({ activityId }),
    ]);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando actividad' });
  }
}

export async function commitToActivity(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, activityId } = req.params;
    const { schedule, expoPushToken, timezone } = req.body;

    if (!await assertMember(groupId, userId)) return res.status(404).json({ error: 'Grupo no encontrado' });

    const activity = await GroupActivity.findOne({ _id: activityId, groupId, isActive: true });
    if (!activity) return res.status(404).json({ error: 'Actividad no encontrada' });

    if (!Array.isArray(schedule) || schedule.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos un horario' });
    }

    const commitment = await ActivityCommitment.findOneAndUpdate(
      { activityId, userId },
      {
        $set: {
          groupId,
          schedule,
          timezone: timezone || 'America/Lima',
          isActive: true,
          ...(expoPushToken ? { expoPushToken } : {}),
        },
      },
      { upsert: true, new: true }
    );

    // Notify group room
    const user = await User.findById(userId).select('name email').lean();
    const conv = await Conversation.findById(groupId).select('groupName').lean();
    const io = getIO();
    if (io) {
      io.to(groupId).emit('activity:commitment', {
        activityId,
        userId,
        userName: user?.name,
      });
    }

    // Send confirmation email + push
    if (user?.email) {
      sendCommitmentConfirmation(
        user.email,
        user.name,
        activity.emoji,
        activity.name,
        (conv as any)?.groupName ?? 'Grupo',
        schedule
      );
    }
    if (expoPushToken) {
      sendPushNotification(
        expoPushToken,
        `${activity.emoji} ¡Compromiso confirmado!`,
        `Te has comprometido con ${activity.name}. ¡Que Dios te bendiga!`
      );
    }

    res.json(commitment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando compromiso' });
  }
}

export async function cancelCommitment(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { activityId } = req.params;

    await ActivityCommitment.findOneAndUpdate(
      { activityId, userId },
      { $set: { isActive: false } }
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error cancelando compromiso' });
  }
}

export async function getActivityCommitments(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId, activityId } = req.params;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = conv.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden ver los compromisos' });

    const commitments = await ActivityCommitment.find({ activityId, isActive: true })
      .populate('userId', 'name avatar')
      .lean();

    res.json(commitments);
  } catch {
    res.status(500).json({ error: 'Error obteniendo compromisos' });
  }
}

export async function getMyCommitments(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;

    if (groupId && !await assertMember(groupId, userId)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const query: any = { userId, isActive: true };
    if (groupId) query.groupId = groupId;

    const commitments = await ActivityCommitment.find(query)
      .populate('activityId', 'name emoji type')
      .populate('groupId', 'groupName')
      .lean();

    res.json(commitments);
  } catch {
    res.status(500).json({ error: 'Error obteniendo compromisos' });
  }
}

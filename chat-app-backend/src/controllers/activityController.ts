import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { GroupActivity, ACTIVITY_META, ActivityType } from '../models/GroupActivity';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PrayerRequest } from '../models/PrayerRequest';
import { ReadingPlanSubscription } from '../models/ReadingPlanSubscription';
import { getPlanForSub } from './readingPlanController';
import { computeCurrentDay } from '../lib/readingPlans';
import { User } from '../models/User';
import { getIO } from '../socket/ioSingleton';
import { sendCommitmentConfirmation, sendActivityNotification } from '../services/emailService';
import { sendPushNotification, sendPushNotifications } from '../services/pushService';
import { sendWebPushToUsers } from '../services/webPushService';
import { isGlobalAdmin } from '../services/adminService';

async function assertMember(groupId: string, userId: string): Promise<any | null> {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId });
}

/**
 * GET /groups/:groupId/activities/summary
 *
 * Lo que hay abierto en el grupo, para la franja del CHAT. Hasta ahora las
 * actividades y las peticiones de oración vivían en pantallas aparte y la única
 * puerta desde el chat eran dos iconos redondos de 34px sin etiqueta ni número:
 * quien no supiera lo que eran, no los tocaba. Y la gente pasa el tiempo en el
 * chat, no en esas pantallas.
 *
 * Devuelve también `iParticipate`: la franja NO debe insistir a quien ya está
 * dentro. A ese solo se le informa; al que no participa se le invita.
 */
export async function getGroupSummary(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;

    const conv = await assertMember(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const [activities, prayers, myCommitments, myPrayers, planSubs] = await Promise.all([
      GroupActivity.countDocuments({ groupId }),
      PrayerRequest.countDocuments({ groupId, isAnswered: false }),
      ActivityCommitment.countDocuments({ groupId, userId, isActive: true }),
      PrayerRequest.countDocuments({ groupId, isAnswered: false, 'prayingUsers.userId': userId }),
      // Plan de lectura que lee el grupo (las suscripciones ligadas a él).
      //
      // ORDENADO por fecha de inicio: sin `sort`, MongoDB no garantiza el orden, y
      // si el grupo lee DOS planes, `planSubs[0]` podía ser uno u otro según la
      // consulta. Dos miembros —o el mismo, al recargar— veían el chip apuntando a
      // planes distintos. Con el orden fijado, "el plan del grupo" es siempre el
      // que empezaron primero.
      ReadingPlanSubscription.find({ group: groupId }).sort({ startDate: 1, planKey: 1 }).lean(),
    ]);

    // ── Plan de lectura del grupo ─────────────────────────────
    //
    // Los planes de grupo existían pero solo se descubrían entrando a la pestaña
    // Biblia → Planes: un grupo podía tener un plan activo y sus propios miembros
    // no enterarse, porque viven en el CHAT. Este bloque los trae a la franja.
    //
    // El dato que engancha no es "hay un plan": es cuántos del grupo YA LEYERON
    // HOY. Ver que tres de cinco van al día es lo que levanta del sofá; un título
    // de plan, no.
    let plan: any = null;
    if (planSubs.length) {
      // Si el grupo lee varios planes se muestra el que empezaron primero (la
      // consulta va ordenada): la franja es una pista, no una lista.
      const planKey = planSubs[0].planKey;
      const subs = planSubs.filter((s: any) => s.planKey === planKey);
      const def = getPlanForSub(subs[0]);

      if (def) {
        const mySub = subs.find((s: any) => s.user?.toString() === userId);

        // El día en curso se calcula con la zona horaria de CADA miembro (en
        // Madrid y en Lima el día no cambia a la vez), pero la fecha de inicio es
        // la misma para todos: por eso "el día 12" significa lo mismo.
        const readToday = subs.filter((s: any) => {
          const day = computeCurrentDay(s.startDate, s.timezone, def.totalDays);
          return (s.completedDays || []).includes(day);
        }).length;

        const myDay = computeCurrentDay(
          (mySub ?? subs[0]).startDate,
          (mySub ?? subs[0]).timezone ?? 'UTC',
          def.totalDays
        );

        plan = {
          planKey,
          title: def.title,
          currentDay: myDay,
          totalDays: def.totalDays,
          memberCount: subs.length,
          readToday,
          iJoined: !!mySub,
          isTodayDone: !!mySub && (mySub.completedDays || []).includes(myDay),
        };
      }
    }

    res.json({
      activities,
      prayers,
      myCommitments,
      myPrayers,
      plan,
      // "Ya participo" incluye el plan: quien lee con el grupo está dentro, y la
      // franja no debe insistirle.
      iParticipate: myCommitments > 0 || myPrayers > 0 || !!plan?.iJoined,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo el resumen del grupo' });
  }
}

// Resuelve la conversación de grupo permitiendo al admin general (web role:'admin')
// operar sin ser miembro ni admin del grupo.
async function resolveGroup(groupId: string, userId: string) {
  const globalAdmin = await isGlobalAdmin(userId);
  const conv = globalAdmin
    ? await Conversation.findOne({ _id: groupId, isGroup: true })
    : await assertMember(groupId, userId);
  return { conv, globalAdmin };
}

// Una actividad espiritual creada por el usuario, para el popup diario
// "notificación" (rotación materiales/oración/actividades). Elige una
// pseudo-aleatoria de las 12 más recientes. Devuelve null si no hay.
export async function getActivityFeed(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;

    const activities = await GroupActivity.find({ createdBy: userId, isActive: true })
      .populate('groupId', 'groupName')
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();
    if (!activities.length) return res.json(null);

    const pick = activities[Math.floor(Math.random() * activities.length)] as any;
    res.json({
      _id: pick._id,
      name: pick.name,
      type: pick.type,
      emoji: pick.emoji,
      description: pick.description ?? '',
      groupId: pick.groupId?._id ?? pick.groupId,
      groupName: pick.groupId?.groupName ?? '',
      startDate: pick.startDate ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo actividad' });
  }
}

export async function getActivities(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { groupId } = req.params;
    const { conv } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const activities = await GroupActivity.find({ groupId, isActive: true }).lean();

    // Attach committed count per activity
    const counts = await ActivityCommitment.aggregate([
      { $match: { groupId: require('mongoose').Types.ObjectId.createFromHexString(groupId), isActive: true } },
      { $group: { _id: '$activityId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const myCommitments = await ActivityCommitment.find({ groupId, userId, isActive: true })
      .select('activityId daysOfWeek startHour startMinute endHour endMinute proposito notificationsEnabled')
      .lean();
    const myMap = new Map(myCommitments.map((c) => [c.activityId.toString(), {
      daysOfWeek: c.daysOfWeek,
      startHour: c.startHour,
      startMinute: c.startMinute,
      endHour: c.endHour,
      endMinute: c.endMinute,
      proposito: c.proposito,
      notificationsEnabled: c.notificationsEnabled,
    }]));

    const result = activities.map((a) => ({
      ...a,
      committedCount: countMap.get(a._id.toString()) ?? 0,
      myCommitment: myMap.get(a._id.toString()) ?? null,
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
    const { type, name, description, startDate, endDate } = req.body;

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
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
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const io = getIO();
    if (io) io.to(groupId).emit('activity:created', { activity });

    res.status(201).json(activity);

    // Notify all group members (fire-and-forget, after response)
    const groupName: string = (conv as any).groupName ?? 'Grupo';
    const activityNameStr: string = activity.name;
    const activityEmoji: string = activity.emoji;
    const startStr = startDate ? new Date(startDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;
    const endStr = endDate ? new Date(endDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

    const members = await User.find({ _id: { $in: conv.participants } })
      .select('name email expoPushToken notificationSettings')
      .lean();
    // El push nativo respeta `activityReminders` (ausente = activada), igual que
    // el push web y los recordatorios del cron.
    const pushTokens = members
      .filter((m) => (m as any).notificationSettings?.activityReminders !== false)
      .map((m) => (m as any).expoPushToken)
      .filter(Boolean) as string[];

    sendPushNotifications(
      pushTokens,
      `${activityEmoji} Nueva actividad: ${activityNameStr}`,
      `En el grupo ${groupName}${startStr ? ` · ${startStr}` : ''}`,
    );

    // 🔔 Web Push (PWA) a los miembros del grupo (menos el creador).
    const creatorId = String((req as any).userId ?? '');
    const memberIds = members
      .map((m: any) => String(m._id))
      .filter((id) => id !== creatorId);
    sendWebPushToUsers(
      memberIds,
      {
        title: `${activityEmoji} Nueva actividad: ${activityNameStr}`,
        body: `En el grupo ${groupName}${startStr ? ` · ${startStr}` : ''}`,
        url: '/notifications',
        tag: `activity-${String(activity._id)}`,
        badge: 'activity',
      },
      'activityReminders'
    );

    members.forEach((m: any) => {
      if (m.email) {
        sendActivityNotification(m.email, m.name, activityEmoji, activityNameStr, groupName, startStr, endStr);
      }
    });
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
    const { name, description, isActive, type, startDate, endDate } = req.body;

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) return res.status(403).json({ error: 'Solo los administradores pueden editar actividades' });

    const update: Record<string, any> = {};
    if (name?.trim()) update.name = name.trim();
    if (description !== undefined) update.description = description?.trim() ?? '';
    if (isActive !== undefined) update.isActive = isActive;
    if (type !== undefined) {
      if (!ACTIVITY_META[type as ActivityType]) {
        return res.status(400).json({ error: 'Tipo de actividad inválido' });
      }
      update.type = type;
      update.emoji = ACTIVITY_META[type as ActivityType].emoji;
    }
    if (startDate !== undefined) update.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) update.endDate = endDate ? new Date(endDate) : null;

    let updated;
    try {
      updated = await GroupActivity.findOneAndUpdate(
        { _id: activityId, groupId },
        { $set: update },
        { new: true }
      );
    } catch (err: any) {
      // Índice único { groupId, type }: ya hay una actividad de ese tipo en el grupo
      if (err?.code === 11000) {
        return res.status(409).json({ error: 'Ya existe una actividad de ese tipo en el grupo' });
      }
      throw err;
    }
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

    const { conv, globalAdmin } = await resolveGroup(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const isAdmin = globalAdmin || conv.admins.some((a: any) => a.toString() === userId);
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
    const { proposito, daysOfWeek, startHour, startMinute, endHour, endMinute, notificationsEnabled, expoPushToken, timezone } = req.body;

    if (!await assertMember(groupId, userId)) return res.status(404).json({ error: 'Grupo no encontrado' });

    const activity = await GroupActivity.findOne({ _id: activityId, groupId, isActive: true });
    if (!activity) return res.status(404).json({ error: 'Actividad no encontrada' });

    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos un día' });
    }

    const startTotal = (startHour ?? 0) * 60 + (startMinute ?? 0);
    const endTotal = (endHour ?? 0) * 60 + (endMinute ?? 0);
    if (endTotal <= startTotal) {
      return res.status(400).json({ error: 'La hora de término debe ser posterior a la de inicio' });
    }

    const commitment = await ActivityCommitment.findOneAndUpdate(
      { activityId, userId },
      {
        $set: {
          groupId,
          proposito: proposito?.trim()?.slice(0, 200) || undefined,
          daysOfWeek,
          startHour: startHour ?? 7,
          startMinute: startMinute ?? 0,
          endHour: endHour ?? 8,
          endMinute: endMinute ?? 0,
          notificationsEnabled: notificationsEnabled !== false,
          timezone: timezone || 'America/Lima',
          isActive: true,
          ...(expoPushToken ? { expoPushToken } : {}),
        },
      },
      { upsert: true, new: true }
    );

    const user = await User.findById(userId).select('name email').lean();
    const conv = await Conversation.findById(groupId).select('groupName').lean();
    const io = getIO();
    if (io) {
      io.to(groupId).emit('activity:commitment', { activityId, userId, userName: user?.name });
    }

    if (user?.email) {
      sendCommitmentConfirmation(
        user.email,
        user.name,
        activity.emoji,
        activity.name,
        (conv as any)?.groupName ?? 'Grupo',
        []
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

    if (!await assertMember(groupId, userId)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

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

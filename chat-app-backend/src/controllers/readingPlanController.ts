import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { ReadingPlanSubscription } from '../models/ReadingPlanSubscription';
import { listPlans, getPlan, computeCurrentDay, generateCustomPlan, BOOK_COUNT } from '../lib/readingPlans';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { sendPushNotification, sendPushNotifications } from '../services/pushService';
import { sendWebPushToUser, sendWebPushToUsers } from '../services/webPushService';
import { createLinkedPost } from '../services/linkedPost';
import { postGroupAnnouncement } from '../services/chatAnnounce';

// Aviso al EMPEZAR un plan: confirma que quedó activo y a qué hora llegará el
// recordatorio diario (si no, no hay forma de saber que se guardó bien hasta el
// día siguiente). Best-effort: nunca bloquea la respuesta ni la rompe.
async function notifyPlanStarted(userId: string, sub: any, title: string) {
  try {
    const user = await User.findById(userId)
      .select('expoPushToken notificationSettings')
      .lean();
    if (!user) return;
    // Misma preferencia que los recordatorios de lectura: si los tiene apagados,
    // tampoco quiere esta confirmación.
    if (user.notificationSettings?.activityReminders === false) return;

    const hhmm = `${String(sub.reminderHour ?? 7).padStart(2, '0')}:${String(
      sub.reminderMinute ?? 0
    ).padStart(2, '0')}`;
    const pushTitle = '📖 Plan de lectura empezado';
    const body = sub.reminderEnabled
      ? `${title} · te avisaremos cada día a las ${hhmm}`
      : `${title} · ¡a leer! (recordatorio diario desactivado)`;

    if (user.expoPushToken) await sendPushNotification(user.expoPushToken, pushTitle, body);
    sendWebPushToUser(
      userId,
      { title: pushTitle, body, url: '/bible', tag: `plan-started-${sub.planKey}`, badge: 'activity' },
      'activityReminders'
    );
  } catch (err) {
    console.error('notifyPlanStarted:', err);
  }
}

// Plan efectivo de una suscripción: generado si es personalizado, del catálogo si no.
// Exportado porque la franja del chat (activityController) también lo necesita:
// duplicarlo allí sería tener dos formas de resolver "qué plan es este".
export function getPlanForSub(sub: any) {
  if (sub?.custom) return generateCustomPlan(sub.custom);
  return getPlan(sub.planKey);
}

// ── Planes de grupo ────────────────────────────────────────
//
// Un plan de grupo NO es un documento aparte: son las suscripciones de los
// miembros con el mismo `planKey` y el mismo `group`. Cada uno conserva su
// progreso y su recordatorio; lo que comparten es el plan y la fecha de inicio,
// que es lo que hace que "el día 12" signifique lo mismo para todos.

/** El grupo si el usuario es miembro; null si no existe o no pertenece. */
function assertGroupMember(groupId: string, userId: string) {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId }).lean();
}

/**
 * Avisa a los DEMÁS miembros de que alguien empezó un plan con el grupo, para
 * que puedan unirse. Best-effort: nunca bloquea ni rompe la respuesta.
 */
async function notifyGroupPlanStarted(
  conv: any,
  starterId: string,
  planTitle: string,
  isNew: boolean
) {
  try {
    const memberIds = (conv.participants || [])
      .map((p: any) => p.toString())
      .filter((id: string) => id !== starterId);
    if (!memberIds.length) return;

    const starter = await User.findById(starterId).select('name').lean();
    const name = starter?.name ?? 'Alguien';
    const groupName = conv.groupName ?? 'el grupo';

    const title = isNew ? '📖 Nuevo plan de lectura en el grupo' : '📖 Alguien más se unió al plan';
    const body = isNew
      ? `${name} empezó "${planTitle}" en ${groupName}. ¡Únete!`
      : `${name} se unió a "${planTitle}" en ${groupName}.`;

    // Los tokens salen de User (no de ActivityCommitment): así llega a TODOS los
    // miembros, no solo a los que tengan compromisos en el grupo.
    const tokens = await User.find({
      _id: { $in: memberIds },
      expoPushToken: { $exists: true, $ne: null },
    }).distinct('expoPushToken');

    sendPushNotifications(tokens, title, body, {
      groupId: conv._id.toString(),
      screen: 'bible',
    });

    sendWebPushToUsers(
      memberIds,
      {
        title,
        body,
        url: '/bible',
        tag: `group-plan-${conv._id}`,
        badge: 'activity',
      },
      'activityReminders'
    );
  } catch (err) {
    console.error('notifyGroupPlanStarted:', err);
  }
}

// Al EMPEZAR un plan nuevo con un grupo (no al unirse a uno existente): (1) un
// post automático en el feed de la comunidad, para que otros lo descubran y se
// unan al grupo, y (2) un mensaje en el propio chat del grupo. Es lo que une el
// chat, la Biblia y los posts. Best-effort, no bloquea la respuesta.
function announceNewGroupPlan(conv: any, userId: string, planKey: string, title: string) {
  const groupId = conv._id.toString();
  const groupName = conv.groupName ?? 'el grupo';

  createLinkedPost({
    authorId: userId,
    type: 'plan',
    // Un plan de grupo no es un documento con _id propio (son suscripciones), así
    // que la clave del evento se compone del grupo + el plan.
    refId: `${groupId}:${planKey}`,
    groupId,
    groupName,
    groupImage: conv.groupAvatar ?? null,
    title,
    body: `📖 ${groupName} empezó el plan de lectura "${title}". ¡Únete y leamos juntos!`,
    url: `/bible?tab=plans&planGroup=${groupId}`,
  });

  postGroupAnnouncement(
    groupId,
    userId,
    `📖 Empecé el plan de lectura *${title}* para leerlo con el grupo. ¡Únete desde el botón "Plan de lectura" de arriba! 🙌`
  );
}

// ── Catálogo (público, no requiere sesión) ─────────────────

// GET /bible/plans — lista de planes disponibles (metadatos).
export function getPlans(_req: AuthRequest, res: Response): void {
  res.json(listPlans());
}

// GET /bible/plans/:key — plan completo (todos los días con sus referencias).
export function getPlanDetail(req: AuthRequest, res: Response): void {
  const plan = getPlan(req.params.key);
  if (!plan) {
    res.status(404).json({ error: 'Plan no encontrado' });
    return;
  }
  res.json(plan);
}

// ── Suscripciones del usuario (requieren sesión) ───────────

function shapeSubscription(sub: any) {
  const plan = getPlanForSub(sub);
  const totalDays = plan?.totalDays ?? 0;
  const currentDay = plan
    ? computeCurrentDay(sub.startDate, sub.timezone, totalDays)
    : 1;
  const today = plan?.days?.[currentDay - 1] ?? null;
  const completed = sub.completedDays || [];
  return {
    planKey: sub.planKey,
    isCustom: !!sub.custom,
    custom: sub.custom ?? null,
    // Grupo con el que se lee este plan (null = plan personal).
    groupId: sub.group ? sub.group.toString() : null,
    title: plan?.title ?? sub.planKey,
    description: plan?.description ?? '',
    category: plan?.category ?? '',
    startDate: sub.startDate,
    timezone: sub.timezone,
    reminderEnabled: sub.reminderEnabled,
    reminderHour: sub.reminderHour,
    reminderMinute: sub.reminderMinute,
    totalDays,
    currentDay,
    completedDays: completed,
    completedCount: completed.length,
    isTodayDone: completed.includes(currentDay),
    isFinished: completed.length >= totalDays && totalDays > 0,
    today: today
      ? { day: today.day, label: today.label, references: today.references }
      : null,
  };
}

// GET /bible/me/plans — planes del usuario con progreso y lectura de hoy.
export async function getMyPlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const subs = await ReadingPlanSubscription.find({ user: req.userId }).lean();
    res.json(subs.map(shapeSubscription));
  } catch (err) {
    console.error('getMyPlans:', err);
    res.status(500).json({ error: 'Error al cargar tus planes' });
  }
}

// POST /bible/me/plans — suscribirse a un plan (del catálogo o personalizado).
export async function subscribePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { planKey, custom, startDate, timezone, reminderEnabled, reminderHour, reminderMinute } = req.body || {};

    // ── Plan personalizado ──────────────────────────────────
    if (custom && typeof custom === 'object') {
      const bookStart = Number(custom.bookStart);
      const bookEnd = Number(custom.bookEnd);
      const days = Number(custom.days);
      if (
        !Number.isInteger(bookStart) || !Number.isInteger(bookEnd) || !Number.isInteger(days) ||
        bookStart < 0 || bookEnd >= BOOK_COUNT || bookStart > bookEnd || days < 1 || days > 400
      ) {
        res.status(400).json({ error: 'Plan personalizado inválido' });
        return;
      }
      const def = {
        title: String(custom.title || 'Mi plan').slice(0, 80),
        bookStart,
        bookEnd,
        days,
      };
      const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const doc: any = {
        user: req.userId,
        planKey: key,
        custom: def,
        completedDays: [],
        timezone: typeof timezone === 'string' && timezone ? timezone : 'UTC',
        startDate: startDate ? new Date(startDate) : new Date(),
      };

      // Un plan personalizado también se puede empezar CON un grupo: queda ligado
      // igual que uno del catálogo y los demás lo verán en "planes de los
      // miembros de {grupo}" (getMyGroupPlans lo resuelve por su `custom`). Como
      // la clave es nueva y única, es siempre el creador — no hay fecha que
      // heredar; los que se unan después la heredarán de esta.
      const customGroupId = typeof req.body?.groupId === 'string' ? req.body.groupId : null;
      let customConv: any = null;
      if (customGroupId) {
        customConv = await assertGroupMember(customGroupId, req.userId!);
        if (!customConv) {
          res.status(403).json({ error: 'No eres miembro de ese grupo' });
          return;
        }
        doc.group = customGroupId;
      }

      if (typeof reminderEnabled === 'boolean') doc.reminderEnabled = reminderEnabled;
      if (Number.isInteger(reminderHour)) doc.reminderHour = Math.min(23, Math.max(0, reminderHour));
      if (Number.isInteger(reminderMinute)) doc.reminderMinute = Math.min(59, Math.max(0, reminderMinute));
      const sub = await ReadingPlanSubscription.create(doc);
      const shapedCustom = shapeSubscription(sub.toObject());
      res.status(201).json(shapedCustom);
      if (customConv) {
        notifyGroupPlanStarted(customConv, req.userId!, shapedCustom.title, true);
        announceNewGroupPlan(customConv, req.userId!, key, shapedCustom.title);
      } else {
        notifyPlanStarted(req.userId!, sub.toObject(), shapedCustom.title);
      }
      return;
    }

    // ── ¿Es un plan de GRUPO? ───────────────────────────────
    // Con `groupId` la suscripción queda ligada al grupo. Dos reglas:
    //  1. Hay que ser miembro (si no, cualquiera se colaría en el progreso ajeno).
    //  2. La fecha de inicio la manda el GRUPO, no el cliente: quien se une el
    //     día 12 se alinea con los demás en vez de empezar por el día 1. Sin
    //     esto, "hoy toca Juan 5" significaría algo distinto para cada miembro y
    //     la función entera pierde el sentido.
    const groupId = typeof req.body?.groupId === 'string' ? req.body.groupId : null;
    let conv: any = null;
    let groupStartDate: Date | null = null;
    let isNewGroupPlan = true;
    // Al unirse a un plan PERSONALIZADO del grupo, su definición no está en el
    // catálogo: se hereda de la suscripción del creador (si no, `getPlan` daría
    // null y no habría forma de saber qué leer).
    let inheritedCustom: any = null;

    if (groupId) {
      conv = await assertGroupMember(groupId, req.userId!);
      if (!conv) {
        res.status(403).json({ error: 'No eres miembro de ese grupo' });
        return;
      }
      // ¿Ya hay alguien del grupo leyendo este plan? Entonces heredo su fecha (y
      // su definición, si es personalizado).
      const existing = await ReadingPlanSubscription.findOne({ group: groupId, planKey })
        .sort({ startDate: 1 })
        .select('startDate custom')
        .lean();
      if (existing) {
        groupStartDate = existing.startDate;
        isNewGroupPlan = false;
        if (existing.custom) inheritedCustom = existing.custom;
      }
    }

    // El plan es válido si está en el catálogo, o si me uno a uno personalizado de
    // mi grupo (cuya definición acabo de heredar).
    const plan = inheritedCustom ? generateCustomPlan(inheritedCustom) : getPlan(planKey);
    if (!plan) {
      res.status(400).json({ error: 'Plan no válido' });
      return;
    }

    const update: any = {
      timezone: typeof timezone === 'string' && timezone ? timezone : 'UTC',
      startDate: groupStartDate ?? (startDate ? new Date(startDate) : new Date()),
    };
    // `group` solo se toca cuando viene groupId: así, reajustar el recordatorio de
    // un plan personal no lo desliga de nada, y volver a suscribirse a un plan
    // que ya seguías por tu cuenta lo LIGA al grupo (el índice único
    // {user, planKey} garantiza que no se duplique).
    if (groupId) update.group = groupId;
    if (inheritedCustom) update.custom = inheritedCustom;
    if (typeof reminderEnabled === 'boolean') update.reminderEnabled = reminderEnabled;
    if (Number.isInteger(reminderHour)) update.reminderHour = Math.min(23, Math.max(0, reminderHour));
    if (Number.isInteger(reminderMinute)) update.reminderMinute = Math.min(59, Math.max(0, reminderMinute));

    const sub = await ReadingPlanSubscription.findOneAndUpdate(
      { user: req.userId, planKey },
      { $set: update, $setOnInsert: { user: req.userId, planKey, completedDays: [] } },
      { upsert: true, new: true }
    ).lean();

    const shaped = shapeSubscription(sub);
    res.status(201).json(shaped);

    if (conv) {
      notifyGroupPlanStarted(conv, req.userId!, shaped.title, isNewGroupPlan);
      // Solo al ESTRENAR el plan en el grupo (no cuando alguien se une a uno que
      // ya se leía): el post y el mensaje son "empezamos esto", no "yo también".
      if (isNewGroupPlan) announceNewGroupPlan(conv, req.userId!, planKey, shaped.title);
    } else {
      notifyPlanStarted(req.userId!, sub, shaped.title);
    }
  } catch (err) {
    console.error('subscribePlan:', err);
    res.status(500).json({ error: 'Error al empezar el plan' });
  }
}

// Da forma a UN plan de grupo (todas las suscripciones de los miembros que
// comparten grupo + planKey) para las vistas sociales. Se comparte entre
// getGroupPlans (un grupo) y getMyGroupPlans (todos mis grupos): duplicarlo sería
// arriesgarse a que las dos vistas diverjan. Devuelve null si el plan se retiró
// del catálogo (no hay forma de resolver su contenido).
function shapeGroupPlan(
  list: any[],
  groupId: string,
  groupName: string,
  myUserId?: string
) {
  const plan = getPlanForSub(list[0]);
  if (!plan) return null;

  const totalDays = plan.totalDays;
  const startDate = list[0].startDate;

  // El día en curso se calcula con la zona horaria de CADA miembro (en Madrid y
  // en Lima el día no cambia a la vez), pero la fecha de inicio es la misma.
  const members = list
    .map((sub: any) => {
      const currentDay = computeCurrentDay(sub.startDate, sub.timezone, totalDays);
      const completed = sub.completedDays || [];
      return {
        userId: (sub.user?._id ?? sub.user)?.toString(),
        name: sub.user?.name ?? 'Usuario',
        avatar: sub.user?.avatar ?? null,
        currentDay,
        completedCount: completed.length,
        isTodayDone: completed.includes(currentDay),
        isFinished: completed.length >= totalDays,
      };
    })
    .sort((a, b) => b.completedCount - a.completedCount);

  const mySub = list.find((s: any) => (s.user?._id ?? s.user)?.toString() === myUserId);
  const me = members.find((m) => m.userId === myUserId);

  return {
    // groupId/groupName viajan con el plan para la vista "planes de mis grupos",
    // donde una sola lista mezcla varios grupos.
    groupId,
    groupName,
    planKey: list[0].planKey,
    isCustom: !!list[0].custom,
    title: plan.title,
    description: plan.description ?? '',
    category: plan.category ?? '',
    totalDays,
    startDate,
    // "Hoy toca el día N" según MI zona horaria (o UTC si aún no me he unido).
    currentDay: computeCurrentDay(startDate, mySub?.timezone ?? 'UTC', totalDays),
    memberCount: members.length,
    isJoined: !!me,
    members,
  };
}

// GET /bible/groups/:groupId/plans — los planes que lee el grupo, con el progreso
// de cada miembro. Es LA vista de la función: ver quién va por dónde es lo que
// hace que nadie abandone en silencio.
export async function getGroupPlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { groupId } = req.params;
    const conv = await assertGroupMember(groupId, req.userId!);
    if (!conv) {
      res.status(403).json({ error: 'No eres miembro de ese grupo' });
      return;
    }

    const subs = await ReadingPlanSubscription.find({ group: groupId })
      .populate('user', 'name avatar')
      .lean();

    // Las suscripciones se agrupan por plan: cada plan del grupo con sus lectores.
    const byPlan = new Map<string, any[]>();
    for (const sub of subs) {
      if (!byPlan.has(sub.planKey)) byPlan.set(sub.planKey, []);
      byPlan.get(sub.planKey)!.push(sub);
    }

    const groupName = (conv as any).groupName ?? 'Mi grupo';
    const plans = [];
    for (const [, list] of byPlan) {
      const shaped = shapeGroupPlan(list, groupId, groupName, req.userId);
      if (shaped) plans.push(shaped);
    }

    res.json(plans);
  } catch (err) {
    console.error('getGroupPlans:', err);
    res.status(500).json({ error: 'Error al cargar los planes del grupo' });
  }
}

// GET /bible/me/group-plans — TODOS los planes que se leen en los grupos del
// usuario, aunque él aún no se haya unido. Es lo que alimenta la sección "Planes
// de los miembros de {grupo}" de la pestaña de planes: sin esto, un plan que
// empieza un compañero es invisible hasta que te unes, y el botón del chat ("N de
// M leyeron hoy") lleva a una página que no menciona ese plan por ningún lado.
export async function getMyGroupPlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const groups = await Conversation.find({
      isGroup: true,
      participants: req.userId,
    })
      .select('groupName')
      .lean();
    if (!groups.length) {
      res.json([]);
      return;
    }

    const groupNameById = new Map(
      groups.map((g: any) => [g._id.toString(), g.groupName ?? 'Mi grupo'])
    );
    const groupIds = groups.map((g: any) => g._id);

    const subs = await ReadingPlanSubscription.find({ group: { $in: groupIds } })
      .populate('user', 'name avatar')
      .lean();

    // Agrupadas por grupo + plan (dos grupos podrían leer el mismo plan a la vez).
    const byKey = new Map<string, any[]>();
    for (const sub of subs) {
      const k = `${sub.group?.toString()}::${sub.planKey}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(sub);
    }

    const plans = [];
    for (const [, list] of byKey) {
      const gid = list[0].group.toString();
      const shaped = shapeGroupPlan(list, gid, groupNameById.get(gid) ?? 'Mi grupo', req.userId);
      if (shaped) plans.push(shaped);
    }

    res.json(plans);
  } catch (err) {
    console.error('getMyGroupPlans:', err);
    res.status(500).json({ error: 'Error al cargar los planes de tus grupos' });
  }
}

// PATCH /bible/me/plans/:key — ajustar recordatorio o reiniciar (nueva fecha).
export async function updateMyPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { reminderEnabled, reminderHour, reminderMinute, timezone, startDate, resetProgress } = req.body || {};
    const update: any = {};
    if (typeof reminderEnabled === 'boolean') update.reminderEnabled = reminderEnabled;
    if (Number.isInteger(reminderHour)) update.reminderHour = Math.min(23, Math.max(0, reminderHour));
    if (Number.isInteger(reminderMinute)) update.reminderMinute = Math.min(59, Math.max(0, reminderMinute));
    if (typeof timezone === 'string' && timezone) update.timezone = timezone;
    if (startDate) update.startDate = new Date(startDate);
    if (resetProgress === true) update.completedDays = [];

    const sub = await ReadingPlanSubscription.findOneAndUpdate(
      { user: req.userId, planKey: req.params.key },
      { $set: update },
      { new: true }
    ).lean();

    if (!sub) {
      res.status(404).json({ error: 'No estás suscrito a ese plan' });
      return;
    }
    res.json(shapeSubscription(sub));
  } catch (err) {
    console.error('updateMyPlan:', err);
    res.status(500).json({ error: 'Error al actualizar el plan' });
  }
}

// POST /bible/me/plans/:key/toggle-day — marca/desmarca un día como leído.
export async function togglePlanDay(req: AuthRequest, res: Response): Promise<void> {
  try {
    const day = Number(req.body?.day);
    if (!Number.isInteger(day) || day < 1) {
      res.status(400).json({ error: 'Día inválido' });
      return;
    }
    const sub = await ReadingPlanSubscription.findOne({ user: req.userId, planKey: req.params.key });
    if (!sub) {
      res.status(404).json({ error: 'No estás suscrito a ese plan' });
      return;
    }
    const set = new Set(sub.completedDays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    sub.completedDays = [...set].sort((a, b) => a - b);
    await sub.save();
    res.json(shapeSubscription(sub.toObject()));
  } catch (err) {
    console.error('togglePlanDay:', err);
    res.status(500).json({ error: 'Error al actualizar el progreso' });
  }
}

// DELETE /bible/me/plans/:key — abandonar el plan.
export async function unsubscribePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    await ReadingPlanSubscription.deleteOne({ user: req.userId, planKey: req.params.key });
    res.json({ ok: true });
  } catch (err) {
    console.error('unsubscribePlan:', err);
    res.status(500).json({ error: 'Error al abandonar el plan' });
  }
}

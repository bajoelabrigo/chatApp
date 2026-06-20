import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { toZonedTime } from 'date-fns-tz';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { PrayerRequest } from '../models/PrayerRequest';
import { GroupActivity } from '../models/GroupActivity';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PersonalCommitment } from '../models/PersonalCommitment';
import { Material } from '../models/Material';
import { MaterialView } from '../models/MaterialView';

type NotificationKind =
  | 'chat'
  | 'missed_call'
  | 'prayer'
  | 'prayer_pray'
  | 'activity'
  | 'reminder'
  | 'material';

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timestamp: string;
  isNew: boolean;
  isRead?: boolean;
  avatar?: string;
  emoji?: string;
  // hacia dónde navega el tap en el frontend
  nav: { screen: 'chat' | 'prayer' | 'activities' | 'activities-tab' | 'material'; id: string };
  data?: { unreadCount?: number; callType?: 'audio' | 'video'; prayingCount?: number };
}

const hm = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

// Ventana de tiempo para peticiones de oración / actividades / llamadas perdidas.
const WINDOW_DAYS = 30;

function previewOf(msg: any, isGroup: boolean, currentUserId: string): string {
  if (!msg) return '';
  if (msg.isDeletedForEveryone) return '🚫 Mensaje eliminado';
  let content = '';
  if (msg.type === 'image') content = '📷 Imagen';
  else if (msg.type === 'audio') content = '🎤 Nota de voz';
  else if (msg.type === 'document') content = `📎 ${msg.fileName ?? 'Documento'}`;
  else if (msg.type === 'call') content = '📞 Llamada';
  else content = msg.content ?? '';
  if (isGroup && msg.senderId && typeof msg.senderId === 'object') {
    const isMe = msg.senderId._id?.toString() === currentUserId;
    const prefix = isMe ? 'Tú' : msg.senderId.name ?? 'Miembro';
    return `${prefix}: ${content}`;
  }
  return content;
}

export async function getNotifications(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const userObjId = new Types.ObjectId(userId);

    const user = await User.findById(userId)
      .select('lastNotificationsSeen blockedUsers readNotifications dismissedNotifications')
      .lean();
    const lastSeen = user?.lastNotificationsSeen ? new Date(user.lastNotificationsSeen) : new Date(0);
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Mapas id → timestamp (ms) del marcado más reciente como leído / eliminado.
    const latestFlag = (arr?: { id: string; at: Date }[]) => {
      const m = new Map<string, number>();
      for (const f of arr ?? []) {
        const t = new Date(f.at).getTime();
        if (!m.has(f.id) || t > (m.get(f.id) as number)) m.set(f.id, t);
      }
      return m;
    };
    const readMap = latestFlag(user?.readNotifications);
    const dismissedMap = latestFlag(user?.dismissedNotifications);

    // Conversaciones del usuario (no archivadas) — para chats, llamadas y para
    // derivar los grupos a los que pertenece.
    const conversations = await Conversation.find({
      participants: userId,
      archivedBy: { $ne: userId },
    })
      .populate('participants', 'name avatar')
      .populate({ path: 'lastMessage', populate: { path: 'senderId', select: 'name avatar' } })
      .lean();

    const convIds = conversations.map((c) => c._id);
    const groupIds = conversations.filter((c) => c.isGroup).map((c) => c._id);
    const convMap = new Map<string, any>(conversations.map((c) => [c._id.toString(), c]));

    const items: NotificationItem[] = [];

    // ── 1. Chats con mensajes sin leer ──────────────────────────────────────
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          senderId: { $ne: userObjId },
          readBy: { $not: { $elemMatch: { $eq: userObjId } } },
          isDeletedForEveryone: { $ne: true },
        },
      },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
    ]);

    for (const u of unreadAgg) {
      const conv = convMap.get(u._id.toString());
      if (!conv) continue;
      const other = conv.isGroup
        ? null
        : (conv.participants as any[]).find((p) => p._id.toString() !== userId);
      const title = conv.isGroup ? conv.groupName || 'Grupo' : other?.name || 'Usuario';
      const avatar = conv.isGroup ? conv.groupAvatar : other?.avatar;
      items.push({
        id: `chat:${conv._id}`,
        kind: 'chat',
        title,
        body: previewOf(conv.lastMessage, conv.isGroup, userId),
        timestamp: (conv.lastMessageAt ?? conv.updatedAt ?? conv.createdAt) as any,
        isNew: true, // todo chat sin leer cuenta como nuevo
        avatar,
        nav: { screen: 'chat', id: conv._id.toString() },
        data: { unreadCount: u.count },
      });
    }

    // ── 2. Llamadas perdidas ────────────────────────────────────────────────
    // Se notifica a AMBOS lados: al receptor ("Llamada perdida") y a quien llamó
    // ("Llamada no contestada"). El mensaje guarda senderId = quien llamó.
    const missedCalls = await Message.find({
      conversationId: { $in: convIds },
      type: 'call',
      callStatus: 'missed',
      deletedFor: { $ne: userObjId },
      createdAt: { $gte: windowStart },
    })
      .populate('senderId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    for (const call of missedCalls) {
      const conv = convMap.get(call.conversationId.toString());
      if (!conv) continue;
      const caller = call.senderId as any;
      const isVideo = call.callType === 'video';
      const iAmCaller = caller?._id?.toString() === userId;
      // Para quien llamó, la tarjeta muestra al otro participante (a quien no contestó).
      const other = conv.isGroup
        ? null
        : (conv.participants as any[]).find((p) => p._id.toString() !== userId);
      const title = iAmCaller
        ? conv.isGroup
          ? conv.groupName || 'Grupo'
          : other?.name || 'Llamada'
        : caller?.name || 'Llamada perdida';
      const avatar = iAmCaller
        ? conv.isGroup
          ? conv.groupAvatar
          : other?.avatar
        : caller?.avatar;
      const body = iAmCaller
        ? `Llamada ${isVideo ? 'de video' : 'de voz'} no contestada`
        : `Llamada perdida ${isVideo ? 'de video' : 'de voz'}`;
      items.push({
        id: `call:${call._id}`,
        kind: 'missed_call',
        title,
        body,
        timestamp: call.createdAt as any,
        isNew: new Date(call.createdAt).getTime() > lastSeen.getTime(),
        avatar,
        nav: { screen: 'chat', id: call.conversationId.toString() },
        data: { callType: isVideo ? 'video' : 'audio' },
      });
    }

    // ── 3. Peticiones de oración de mis grupos (no mías, sin responder) ──────
    if (groupIds.length > 0) {
      const prayers = await PrayerRequest.find({
        groupId: { $in: groupIds },
        isAnswered: false,
        authorId: { $ne: userObjId },
        createdAt: { $gte: windowStart },
      })
        .populate('authorId', 'name avatar')
        .populate('groupId', 'groupName groupAvatar')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean();

      for (const p of prayers) {
        const group = p.groupId as any;
        const author = p.isAnonymous ? null : (p.authorId as any);
        const authorName = p.isAnonymous ? 'Alguien' : author?.name || 'Alguien';
        items.push({
          id: `prayer:${p._id}`,
          kind: 'prayer',
          title: `📿 ${group?.groupName || 'Grupo'}`,
          body: `${authorName}: ${p.content.slice(0, 90)}`,
          timestamp: p.createdAt as any,
          isNew: new Date(p.createdAt).getTime() > lastSeen.getTime(),
          avatar: p.isAnonymous ? undefined : author?.avatar,
          nav: { screen: 'prayer', id: group?._id?.toString() || group?.toString() },
          data: { prayingCount: p.prayingUsers?.length ?? 0 },
        });
      }

      // ── 3b. Alguien empezó a orar por MIS peticiones ─────────────────────
      const myPrayers = await PrayerRequest.find({
        authorId: userObjId,
        'prayingUsers.0': { $exists: true },
      })
        .populate('prayingUsers.userId', 'name avatar')
        .populate('groupId', 'groupName groupAvatar')
        .lean();

      const prayItems: NotificationItem[] = [];
      for (const p of myPrayers) {
        const group = p.groupId as any;
        for (const pu of p.prayingUsers as any[]) {
          const u = pu.userId;
          if (!u || u._id?.toString() === userId) continue; // ignora mis propias oraciones
          if (!pu.prayedAt || new Date(pu.prayedAt) < windowStart) continue;
          prayItems.push({
            id: `pray:${p._id}:${u._id}`,
            kind: 'prayer_pray',
            title: `🙏 ${u.name || 'Alguien'} está orando por ti`,
            body: pu.message?.trim()
              ? `"${pu.message.trim().slice(0, 70)}"`
              : `Por tu petición: ${p.content.slice(0, 70)}`,
            timestamp: pu.prayedAt as any,
            isNew: new Date(pu.prayedAt).getTime() > lastSeen.getTime(),
            avatar: u.avatar,
            nav: { screen: 'prayer', id: group?._id?.toString() || group?.toString() },
          });
        }
      }
      prayItems
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 30)
        .forEach((it) => items.push(it));

      // ── 4. Actividades que creé o a las que me comprometí ────────────────
      const myCommitments = await ActivityCommitment.find({ userId, isActive: true })
        .select('activityId')
        .lean();
      const committedIds = myCommitments.map((c) => c.activityId);

      const activities = await GroupActivity.find({
        groupId: { $in: groupIds },
        isActive: true,
        createdAt: { $gte: windowStart },
        $or: [{ createdBy: userObjId }, { _id: { $in: committedIds } }],
      })
        .populate('groupId', 'groupName groupAvatar')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean();

      const committedSet = new Set(committedIds.map((id) => id.toString()));
      for (const a of activities) {
        const group = a.groupId as any;
        const mine = a.createdBy.toString() === userId;
        const committed = committedSet.has(a._id.toString());
        const verb = mine ? 'Creaste' : committed ? 'Te comprometiste a' : 'Nueva actividad';
        items.push({
          id: `activity:${a._id}`,
          kind: 'activity',
          title: `${a.emoji} ${a.name}`,
          body: `${verb} · ${group?.groupName || 'Grupo'}`,
          timestamp: a.createdAt as any,
          isNew: new Date(a.createdAt).getTime() > lastSeen.getTime(),
          emoji: a.emoji,
          nav: { screen: 'activities', id: group?._id?.toString() || group?.toString() },
        });
      }
    }

    // ── 5. Recordatorios de actividades de HOY (grupales + personales) ──────
    // Zona horaria de referencia para los compromisos personales (que no la
    // almacenan): se toma de cualquier compromiso grupal del usuario.
    const tzDoc = await ActivityCommitment.findOne({ userId })
      .select('timezone')
      .sort({ updatedAt: -1 })
      .lean();
    const fallbackTz = tzDoc?.timezone || 'UTC';
    const now = new Date();

    const buildReminder = (
      idPrefix: string,
      doc: any,
      tz: string,
      nav: NotificationItem['nav'],
      subtitle: string
    ): NotificationItem | null => {
      const local = toZonedTime(now, tz);
      if (!doc.daysOfWeek?.includes(local.getDay())) return null;
      const nowMin = local.getHours() * 60 + local.getMinutes();
      const startMin = doc.startHour * 60 + doc.startMinute;
      const endMin = doc.endHour * 60 + doc.endMinute;
      const finished = nowMin >= endMin;
      const upcoming = nowMin < startMin;
      // Timestamp sintético = hoy a la hora de inicio (solo para ordenar la sección).
      const start = new Date(local);
      start.setHours(doc.startHour, doc.startMinute, 0, 0);
      return {
        id: `${idPrefix}:${doc._id}`,
        kind: 'reminder',
        title: `${doc.emoji} ${doc.name}`,
        body: `${finished ? 'Hoy (finalizada)' : upcoming ? 'Hoy' : 'En curso'} · ${hm(doc.startHour, doc.startMinute)}–${hm(doc.endHour, doc.endMinute)}${subtitle ? ` · ${subtitle}` : ''}`,
        timestamp: start.toISOString(),
        isNew: upcoming, // resalta solo las que aún no empiezan (no suma al badge)
        emoji: doc.emoji,
        nav,
      };
    };

    // Compromisos grupales (su activityId trae nombre/emoji; tienen timezone propia).
    const groupCommitments = await ActivityCommitment.find({ userId, isActive: true })
      .populate('activityId', 'name emoji')
      .populate('groupId', 'groupName')
      .lean();
    for (const c of groupCommitments) {
      const activity = c.activityId as any;
      const group = c.groupId as any;
      if (!activity) continue;
      const reminder = buildReminder(
        'reminder-g',
        { ...c, name: activity.name, emoji: activity.emoji },
        c.timezone || fallbackTz,
        { screen: 'activities', id: group?._id?.toString() || group?.toString() || '' },
        group?.groupName || ''
      );
      if (reminder) items.push(reminder);
    }

    // Compromisos personales (sin grupo ni timezone propia → usa la de referencia).
    const personalCommitments = await PersonalCommitment.find({ userId, isActive: true }).lean();
    for (const c of personalCommitments) {
      const reminder = buildReminder(
        'reminder-p',
        c,
        fallbackTz,
        { screen: 'activities-tab', id: '' },
        'Personal'
      );
      if (reminder) items.push(reminder);
    }

    // ── Materiales nuevos ───────────────────────────────────────────────────
    // Materiales publicados en la ventana que el usuario aún no ha visto/descargado.
    const recentMaterials = await Material.find({
      published: true,
      $or: [
        { notifiedAt: { $gte: windowStart } },
        { notifiedAt: null, createdAt: { $gte: windowStart } },
      ],
    })
      .sort({ notifiedAt: -1, createdAt: -1 })
      .limit(20)
      .lean();

    if (recentMaterials.length > 0) {
      const seen = await MaterialView.find({
        userId: userObjId,
        materialId: { $in: recentMaterials.map((m) => m._id) },
      })
        .select('materialId')
        .lean();
      const seenSet = new Set(seen.map((s) => s.materialId.toString()));

      for (const m of recentMaterials) {
        if (seenSet.has(m._id.toString())) continue;
        items.push({
          id: `material:${m._id}`,
          kind: 'material',
          title: '📚 Nuevo material',
          body: m.title,
          timestamp: (m.notifiedAt ?? m.createdAt) as any,
          isNew: true,
          emoji: '📚',
          avatar: m.thumbnail || m.coverImage || undefined,
          nav: { screen: 'material', id: m.slug },
        });
      }
    }

    // Aplicar marcados de leído / eliminado. Un item solo queda oculto (o leído)
    // si el marcado es igual o posterior a su timestamp; si el item se "renueva"
    // (timestamp más reciente que el marcado) vuelve a aparecer como nuevo.
    const visible = items.filter((it) => {
      const dAt = dismissedMap.get(it.id);
      return dAt === undefined || dAt < new Date(it.timestamp).getTime();
    });
    for (const it of visible) {
      const rAt = readMap.get(it.id);
      if (rAt !== undefined && rAt >= new Date(it.timestamp).getTime()) {
        it.isRead = true;
        it.isNew = false;
      }
    }

    // Orden cronológico descendente (más reciente primero).
    visible.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const unreadCount = visible.reduce((acc, it) => {
      if (it.isRead) return acc; // leídos no cuentan
      if (it.kind === 'reminder') return acc; // recordatorios: informativos, no cuentan
      if (it.kind === 'chat') return acc + (it.data?.unreadCount ?? 1);
      return acc + (it.isNew ? 1 : 0);
    }, 0);

    res.json({ items: visible, unreadCount });
  } catch (err) {
    console.error('[notifications] error', err);
    res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
}

export async function markNotificationsSeen(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    await User.findByIdAndUpdate(userId, { $set: { lastNotificationsSeen: new Date() } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error actualizando notificaciones' });
  }
}

// Marca un item derivado (chat/llamada/oración/actividad/recordatorio) con un
// flag `at: ahora`. Se reescribe el registro previo del mismo id para refrescar
// la fecha. `field` es 'readNotifications' o 'dismissedNotifications'.
async function flagNotification(userId: string, field: string, id: string) {
  await User.updateOne({ _id: userId }, { $pull: { [field]: { id } } } as any);
  await User.updateOne(
    { _id: userId },
    { $push: { [field]: { id, at: new Date() } } } as any
  );
}

export async function markNotificationRead(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.body ?? {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id requerido' });
    await flagNotification(userId, 'readNotifications', id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error marcando notificación como leída' });
  }
}

export async function dismissNotification(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { id } = req.body ?? {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id requerido' });
    await flagNotification(userId, 'dismissedNotifications', id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando notificación' });
  }
}

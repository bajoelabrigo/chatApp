// Notificaciones Web Push (PWA) desde el backend móvil.
//
// El chat, las actividades de grupo y las peticiones de oración de grupo viven en
// ESTE backend (no en holy_app), y hasta ahora solo mandaban push nativo Expo a la
// app. Este servicio manda además push web a los navegadores/PWA suscritos, leyendo
// las suscripciones de la MISMA colección `users` compartida (User.webPushSubscriptions),
// que escribe la web. Best-effort: nunca lanza y poda las suscripciones muertas.

import webpush from 'web-push';
import { User } from '../models/User';

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@holyholyholy.es';

let configured = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
  } catch (err) {
    console.error('[webPush] VAPID inválidas:', (err as Error)?.message);
  }
} else {
  console.warn('[webPush] Faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY; push web deshabilitado.');
}

export const isWebPushEnabled = (): boolean => configured;
export const getVapidPublicKey = (): string | null => PUBLIC || null;

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string; // categoría de badge que resuelve el SW (chat/post/prayer/activity…)
}

interface StoredSub {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

interface UserLite {
  _id: any;
  webPushSubscriptions?: StoredSub[];
  notificationSettings?: Record<string, boolean>;
}

// Preferencia del usuario que gobierna este push (messages/prayerRequests/
// activityReminders). Si el usuario la tiene en false, se le omite.
type SettingKey = 'messages' | 'prayerRequests' | 'activityReminders' | 'dailyVerse' | 'live';

const CONCURRENCY = 20;

async function deliverToOne(userId: any, subs: StoredSub[], body: string): Promise<void> {
  if (!subs || !subs.length) return;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        if (sub?.endpoint) dead.push(sub.endpoint);
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          body
        );
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) dead.push(sub.endpoint!);
        else console.error('[webPush] send:', code, err?.body || err?.message);
      }
    })
  );
  if (dead.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { webPushSubscriptions: { endpoint: { $in: dead } } } }
    );
  }
}

async function deliverToUsers(
  users: UserLite[],
  payload: WebPushPayload,
  requireSetting?: SettingKey
): Promise<void> {
  const body = JSON.stringify(payload);
  let idx = 0;
  const worker = async () => {
    while (idx < users.length) {
      const u = users[idx++];
      if (requireSetting && u.notificationSettings?.[requireSetting] === false) continue;
      await deliverToOne(u._id, u.webPushSubscriptions || [], body);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, users.length) }, worker)
  );
}

export async function sendWebPushToUser(
  userId: string | { toString(): string },
  payload: WebPushPayload,
  requireSetting?: SettingKey
): Promise<void> {
  if (!configured || !userId) return;
  const id = userId.toString();
  try {
    const user = await User.findById(id)
      .select('webPushSubscriptions notificationSettings')
      .lean<UserLite>();
    if (!user) return;
    if (requireSetting && user.notificationSettings?.[requireSetting] === false) return;
    await deliverToOne(user._id, user.webPushSubscriptions || [], JSON.stringify(payload));
  } catch (err: any) {
    console.error('[webPush] user:', err?.message);
  }
}

export async function sendWebPushToUsers(
  userIds: Array<string | { toString(): string }>,
  payload: WebPushPayload,
  requireSetting?: SettingKey
): Promise<void> {
  if (!configured) return;
  const ids = [...new Set((userIds || []).map((id) => id.toString()))];
  if (!ids.length) return;
  try {
    const users = await User.find({ _id: { $in: ids } })
      .select('webPushSubscriptions notificationSettings')
      .lean<UserLite[]>();
    await deliverToUsers(users, payload, requireSetting);
  } catch (err: any) {
    console.error('[webPush] users:', err?.message);
  }
}

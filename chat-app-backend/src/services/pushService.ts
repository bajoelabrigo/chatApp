import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { User } from '../models/User';

const expo = new Expo();

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (!Expo.isExpoPushToken(token)) return;
  try {
    const chunks = expo.chunkPushNotifications([{ to: token, title, body, data }]);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error('[pushService] sendPushNotification error:', err);
  }
}

export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const validTokens = tokens.filter(Expo.isExpoPushToken);
  if (validTokens.length === 0) return;

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({ to, title, body, data }));
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          // Remove stale token from all commitments
          await ActivityCommitment.updateMany(
            { expoPushToken: validTokens[i] },
            { $unset: { expoPushToken: '' } }
          );
        }
      }
    } catch (err) {
      console.error('[pushService] sendPushNotifications chunk error:', err);
    }
  }
}

// Preferencia del usuario que gobierna cada push (misma clave que la web).
type PushSettingKey =
  | 'messages'
  | 'prayerRequests'
  | 'activityReminders'
  | 'posts'
  | 'materials';

interface PushUserLite {
  _id: any;
  expoPushToken?: string;
  notificationSettings?: Record<string, boolean>;
}

// Envía push nativo (Expo) a una lista de usuarios por su ID, leyendo su
// `expoPushToken` de la colección `users` y respetando su preferencia de
// notificaciones (`notificationSettings[requireSetting]`). Best-effort: nunca
// lanza y poda los tokens muertos (DeviceNotRegistered) del propio usuario.
// Espejo de `sendWebPushToUsers` para la app móvil nativa.
export async function sendExpoPushToUsers(
  userIds: Array<string | { toString(): string }>,
  payload: { title: string; body: string; data?: Record<string, unknown> },
  requireSetting?: PushSettingKey
): Promise<void> {
  const ids = [...new Set((userIds || []).map((id) => id.toString()))];
  if (!ids.length) return;
  try {
    const users = await User.find({
      _id: { $in: ids },
      expoPushToken: { $exists: true, $nin: [null, ''] },
    })
      .select('expoPushToken notificationSettings')
      .lean<PushUserLite[]>();

    const targets = users.filter(
      (u) =>
        u.expoPushToken &&
        Expo.isExpoPushToken(u.expoPushToken) &&
        !(requireSetting && u.notificationSettings?.[requireSetting] === false)
    );
    if (!targets.length) return;

    const messages: ExpoPushMessage[] = targets.map((u) => ({
      to: u.expoPushToken as string,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const badToken = (chunk[i] as { to: string }).to;
            await User.updateOne({ expoPushToken: badToken }, { $unset: { expoPushToken: '' } });
          }
        }
      } catch (err) {
        console.error('[pushService] sendExpoPushToUsers chunk error:', err);
      }
    }
  } catch (err) {
    console.error('[pushService] sendExpoPushToUsers error:', err);
  }
}

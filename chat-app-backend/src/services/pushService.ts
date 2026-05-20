import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { ActivityCommitment } from '../models/ActivityCommitment';

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

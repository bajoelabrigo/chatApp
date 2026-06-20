import * as SecureStore from 'expo-secure-store';
import { getMyCommitments } from '../services/activityService';
import { getMyPersonalActivities } from '../services/personalActivityService';

const SHOWN_KEY = 'dailyReminderDate';
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmt(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function triggerDailyActivityReminder(
  token: string,
  activityRemindersEnabled = true
): Promise<void> {
  if (!activityRemindersEnabled) return;

  try {
    // Only once per calendar day
    const today = new Date().toDateString();
    const lastShown = await SecureStore.getItemAsync(SHOWN_KEY);
    if (lastShown === today) return;

    // Requires a real device with expo-notifications
    const Device = require('expo-device');
    if (!Device.isDevice) return;

    const Notifications = require('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Fetch all active commitments in parallel
    const [groupCommitments, personalActivities] = await Promise.all([
      getMyCommitments(token),
      getMyPersonalActivities(token),
    ]);

    const totalAll = groupCommitments.length + personalActivities.length;
    if (totalAll === 0) return;

    const todayIdx = new Date().getDay();

    // Activities scheduled for today
    const todayGroup = groupCommitments.filter(
      (c) => Array.isArray(c.daysOfWeek) && c.daysOfWeek.includes(todayIdx)
    );
    const todayPersonal = personalActivities.filter(
      (p) => Array.isArray(p.daysOfWeek) && p.daysOfWeek.includes(todayIdx)
    );
    const allToday = [...todayGroup, ...todayPersonal];

    let title: string;
    let body: string;

    if (allToday.length > 0) {
      title = `🙏 ${allToday.length === 1 ? 'Una actividad' : `${allToday.length} actividades`} para hoy · ${DAY_NAMES[todayIdx]}`;

      const lines = allToday.map((c) => {
        const emoji = (c as any).emoji ?? (c as any).activityId?.emoji ?? '🙏';
        const name  = (c as any).name  ?? (c as any).activityId?.name  ?? 'Actividad';
        return `${emoji} ${name}  ${fmt(c.startHour, c.startMinute)}–${fmt(c.endHour, c.endMinute)}`;
      });
      body = lines.join('\n');
    } else {
      title = '🙏 Tus compromisos con Dios';
      body  = `Hoy no tienes actividades programadas, pero mantén vivo tu compromiso en las ${totalAll} actividad${totalAll > 1 ? 'es' : ''} que elegiste.`;
    }

    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null, // immediate
    });

    await SecureStore.setItemAsync(SHOWN_KEY, today);
  } catch {
    // Non-critical — fail silently
  }
}

import cron from 'node-cron';
import { Types } from 'mongoose';
import { toZonedTime } from 'date-fns-tz';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PersonalCommitment } from '../models/PersonalCommitment';
import { sendPushNotification } from './pushService';
import { sendWebPushToUser } from './webPushService';
import { sendWeeklySummary, WeeklyCommitmentSummary } from './emailService';
import { User } from '../models/User';

function matchesStart(c: { daysOfWeek: number[]; startHour: number; startMinute: number }, localDate: Date): boolean {
  return (
    c.daysOfWeek.includes(localDate.getDay()) &&
    c.startHour === localDate.getHours() &&
    c.startMinute === localDate.getMinutes()
  );
}

function matchesStartAdvance(c: { daysOfWeek: number[]; startHour: number; startMinute: number }, localAdv: Date): boolean {
  return (
    c.daysOfWeek.includes(localAdv.getDay()) &&
    c.startHour === localAdv.getHours() &&
    c.startMinute === localAdv.getMinutes()
  );
}

export function startCronJobs(): void {
  // Job A — every minute: send exact-time and 15-min advance push reminders
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const nowPlus15 = new Date(now.getTime() + 15 * 60 * 1000);

      const commitments = await ActivityCommitment.find({ isActive: true, notificationsEnabled: true })
        .populate('activityId', 'name emoji')
        .populate('userId', 'name');

      for (const c of commitments) {
        const activity = c.activityId as any;
        const user = c.userId as any;
        if (!activity || !user) continue;

        const localNow = toZonedTime(now, c.timezone);
        const localAdv = toZonedTime(nowPlus15, c.timezone);

        const isStart = matchesStart(c, localNow);
        const isAdvance = !isStart && matchesStartAdvance(c, localAdv);
        if (!isStart && !isAdvance) continue;

        const title = isStart
          ? `${activity.emoji} ¡Hora de ${activity.name}!`
          : `${activity.emoji} Recordatorio: ${activity.name} en 15 min`;
        const body = isStart
          ? `Tu sesión de ${activity.name} comienza ahora. ¡Ánimo, ${user.name}!`
          : `Tu sesión de ${activity.name} empieza en 15 minutos.`;

        // Push nativo (si tiene token Expo) + web (PWA), independientes.
        if (c.expoPushToken) await sendPushNotification(c.expoPushToken, title, body);
        sendWebPushToUser(user._id, { title, body, url: '/notifications', tag: `reminder-${String(activity._id ?? activity)}`, badge: 'activity' }, 'activityReminders');
      }

      // ── Compromisos PERSONALES (sin grupo) ──────────────────────────────
      // No guardan expoPushToken (se usa el del usuario) y su timezone puede
      // faltar en registros antiguos → se cae a la de sus compromisos grupales.
      const personal = await PersonalCommitment.find({ isActive: true, notificationsEnabled: true }).lean();
      if (personal.length > 0) {
        const userIds = [...new Set(personal.map((p) => String(p.userId)))];
        const users = await User.find({ _id: { $in: userIds } })
          .select('name expoPushToken')
          .lean();
        const userMap = new Map(users.map((u) => [String(u._id), u]));

        // Timezone de respaldo: la de cualquier compromiso grupal del usuario.
        const tzAgg = await ActivityCommitment.aggregate([
          { $match: { userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } } },
          { $group: { _id: '$userId', timezone: { $first: '$timezone' } } },
        ]);
        const tzMap = new Map(tzAgg.map((t) => [String(t._id), t.timezone as string]));

        for (const p of personal) {
          const user = userMap.get(String(p.userId));
          if (!user) continue;
          const tz = p.timezone || tzMap.get(String(p.userId)) || 'UTC';
          const localNow = toZonedTime(now, tz);
          const localAdv = toZonedTime(nowPlus15, tz);

          const isStart = matchesStart(p, localNow);
          const isAdvance = !isStart && matchesStartAdvance(p, localAdv);
          if (!isStart && !isAdvance) continue;

          const title = isStart
            ? `${p.emoji} ¡Hora de ${p.name}!`
            : `${p.emoji} Recordatorio: ${p.name} en 15 min`;
          const body = isStart
            ? `Tu actividad ${p.name} comienza ahora. ¡Ánimo, ${user.name}!`
            : `Tu actividad ${p.name} empieza en 15 minutos.`;

          if (user.expoPushToken) await sendPushNotification(user.expoPushToken, title, body);
          sendWebPushToUser(p.userId, { title, body, url: '/notifications', tag: `reminder-personal-${String(p._id)}`, badge: 'activity' }, 'activityReminders');
        }
      }
    } catch (err) {
      console.error('[cronService] minute job error:', err);
    }
  });

  // Job B — every hour: send weekly summary to users for whom it is Sunday 8am locally
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();

      const pipeline = await ActivityCommitment.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$userId', timezone: { $first: '$timezone' } } },
      ]);

      for (const { _id: userId, timezone } of pipeline) {
        const localNow = toZonedTime(now, timezone);
        if (localNow.getDay() !== 0 || localNow.getHours() !== 8) continue;

        const user = await User.findById(userId).select('name email').lean();
        if (!user?.email) continue;

        const userCommitments = await ActivityCommitment.find({ userId, isActive: true })
          .populate('activityId', 'name emoji')
          .populate('groupId', 'groupName');

        const summaries: WeeklyCommitmentSummary[] = userCommitments.map((c) => ({
          activityEmoji: (c.activityId as any)?.emoji ?? '🙏',
          activityName: (c.activityId as any)?.name ?? 'Actividad',
          groupName: (c.groupId as any)?.groupName ?? 'Grupo',
          daysOfWeek: c.daysOfWeek,
          startHour: c.startHour,
          startMinute: c.startMinute,
          endHour: c.endHour,
          endMinute: c.endMinute,
        }));

        await sendWeeklySummary(user.email, user.name, summaries);
      }
    } catch (err) {
      console.error('[cronService] hourly job error:', err);
    }
  });

  console.log('[cronService] Jobs started');
}

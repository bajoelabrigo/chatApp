import cron from 'node-cron';
import { toZonedTime } from 'date-fns-tz';
import { ActivityCommitment, ScheduleSlot } from '../models/ActivityCommitment';
import { sendPushNotification } from './pushService';
import { sendWeeklySummary, WeeklyCommitmentSummary } from './emailService';
import { User } from '../models/User';

function matchesSlot(slot: ScheduleSlot, localDate: Date): boolean {
  return (
    slot.dayOfWeek === localDate.getDay() &&
    slot.hour === localDate.getHours() &&
    slot.minute === localDate.getMinutes()
  );
}

export function startCronJobs(): void {
  // Job A — every minute: send exact-time and 15-min advance push reminders
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const nowPlus15 = new Date(now.getTime() + 15 * 60 * 1000);

      const commitments = await ActivityCommitment.find({ isActive: true })
        .populate('activityId', 'name emoji')
        .populate('userId', 'name');

      for (const c of commitments) {
        if (!c.expoPushToken) continue;
        const activity = c.activityId as any;
        const user = c.userId as any;
        if (!activity || !user) continue;

        const localNow = toZonedTime(now, c.timezone);
        const localAdv = toZonedTime(nowPlus15, c.timezone);

        for (const slot of c.schedule) {
          if (matchesSlot(slot, localNow)) {
            await sendPushNotification(
              c.expoPushToken,
              `${activity.emoji} ¡Hora de ${activity.name}!`,
              `Tu sesión de ${activity.name} comienza ahora. ¡Ánimo, ${user.name}!`
            );
          } else if (matchesSlot(slot, localAdv)) {
            await sendPushNotification(
              c.expoPushToken,
              `${activity.emoji} Recordatorio: ${activity.name} en 15 min`,
              `Tu sesión de ${activity.name} empieza en 15 minutos.`
            );
          }
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

      // Get all unique userIds from active commitments
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
          schedule: c.schedule,
        }));

        await sendWeeklySummary(user.email, user.name, summaries);
      }
    } catch (err) {
      console.error('[cronService] hourly job error:', err);
    }
  });

  console.log('[cronService] Jobs started');
}

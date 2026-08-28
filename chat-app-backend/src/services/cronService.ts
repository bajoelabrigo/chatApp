import cron from 'node-cron';
import { Types } from 'mongoose';
import { toZonedTime } from 'date-fns-tz';
import { ActivityCommitment } from '../models/ActivityCommitment';
import { PersonalCommitment } from '../models/PersonalCommitment';
import { ReadingPlanSubscription } from '../models/ReadingPlanSubscription';
import { getPlan, computeCurrentDay, generateCustomPlan } from '../lib/readingPlans';
import { sendPushNotification } from './pushService';
import { sendWebPushToUser } from './webPushService';
import { sendWeeklySummary, WeeklyCommitmentSummary } from './emailService';
import { User } from '../models/User';
import { localDateKey } from '../lib/dailyVerses';
import { dailyVerseFor } from '../controllers/bibleController';
import { Reel } from '../models/Reel';
import { deleteAssetIfUnused } from './mediaCleanup';
import { logger } from './logger';

const log = logger('cron');

// Hora local a la que sale el versículo del día (#8).
const DAILY_VERSE_HOUR = 8;

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

      // ── Recordatorios de PLANES DE LECTURA (#2) ─────────────────────────
      // Un push diario a la hora local elegida con la lectura del día, salvo que
      // ya la haya marcado como leída o el plan haya terminado. `lastRemindedOn`
      // (fecha local) evita duplicados ante reinicios del proceso.
      const planSubs = await ReadingPlanSubscription.find({ reminderEnabled: true });
      if (planSubs.length > 0) {
        const uids = [...new Set(planSubs.map((s) => String(s.user)))];
        const planUsers = await User.find({ _id: { $in: uids } })
          .select('name expoPushToken notificationSettings')
          .lean();
        const planUserMap = new Map(planUsers.map((u) => [String(u._id), u]));

        for (const sub of planSubs) {
          const tz = sub.timezone || 'UTC';
          const local = toZonedTime(now, tz);
          if (local.getHours() !== sub.reminderHour || local.getMinutes() !== sub.reminderMinute) continue;

          const plan = sub.custom ? generateCustomPlan(sub.custom) : getPlan(sub.planKey);
          if (!plan) continue;
          if (sub.completedDays.length >= plan.totalDays) continue; // plan terminado

          const currentDay = computeCurrentDay(sub.startDate, tz, plan.totalDays, now);
          if (sub.completedDays.includes(currentDay)) continue; // ya leyó hoy

          const localDateStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
          if (sub.lastRemindedOn === localDateStr) continue; // ya avisado hoy

          const dayObj = plan.days[currentDay - 1];
          const user = planUserMap.get(String(sub.user));
          if (!dayObj || !user) continue;
          // El interruptor general de recordatorios manda sobre el del plan: si
          // está apagado, tampoco llega el push nativo (antes solo lo respetaba
          // el push web).
          if (user.notificationSettings?.activityReminders === false) continue;

          const title = `📖 Lectura de hoy — ${plan.title}`;
          const body = `Día ${currentDay}: ${dayObj.label}`;

          if (user.expoPushToken) await sendPushNotification(user.expoPushToken, title, body);
          sendWebPushToUser(sub.user, { title, body, url: '/bible', tag: `reading-plan-${sub.planKey}`, badge: 'activity' }, 'activityReminders');

          sub.lastRemindedOn = localDateStr;
          await sub.save();
        }
      }

      // ── VERSÍCULO DEL DÍA (#8) ──────────────────────────────────────────
      // Un push a las 8:00 LOCALES de cada usuario (su `timezone`, que mandan
      // los clientes; sin ella, UTC). Solo a quien tenga push y no lo haya
      // desactivado. `lastDailyVerseOn` (día local) evita duplicados si el
      // proceso se reinicia dentro del mismo minuto.
      const verseUsers = await User.find({
        'notificationSettings.dailyVerse': { $ne: false },
        $or: [
          { expoPushToken: { $exists: true, $ne: null } },
          { 'webPushSubscriptions.0': { $exists: true } },
        ],
      })
        .select('expoPushToken timezone lastDailyVerseOn')
        .lean();

      for (const u of verseUsers) {
        const tz = u.timezone || 'UTC';
        let local: Date;
        try {
          local = toZonedTime(now, tz);
        } catch {
          continue; // zona horaria corrupta: no romper el job por un usuario
        }
        if (local.getHours() !== DAILY_VERSE_HOUR || local.getMinutes() !== 0) continue;

        const dateKey = localDateKey(now, tz);
        if (u.lastDailyVerseOn === dateKey) continue; // ya se le envió hoy

        const verse = await dailyVerseFor(dateKey);
        if (!verse) continue;

        const title = `📖 Versículo del día — ${verse.book} ${verse.chapter}:${verse.verse}`;
        const body = verse.text;

        if (u.expoPushToken) await sendPushNotification(u.expoPushToken, title, body);
        sendWebPushToUser(
          u._id as Types.ObjectId,
          { title, body, url: '/', tag: `daily-verse-${dateKey}`, badge: 'activity' },
          'dailyVerse'
        );

        await User.updateOne({ _id: u._id }, { $set: { lastDailyVerseOn: dateKey } });
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

  // Job C — cada 10 min: barrer las historias caducadas Y SU VIDEO.
  //
  // El índice TTL de Mongo borra el documento, pero **Cloudinary no se entera**:
  // el video de cada historia se quedaba ahí para siempre, y una historia es
  // justo lo que más se publica y menos dura. Aquí se hace el borrado completo,
  // y el TTL queda de red de seguridad con un margen de días por detrás (ver
  // `scripts/reelsTtlGrace.mjs`) para que le dé tiempo a correr a esto.
  //
  // Los clientes no notan nada: las lecturas ya filtran por `expiresAt > ahora`,
  // así que una historia caducada es invisible desde el segundo en que vence,
  // corra este barrido cuando corra.
  cron.schedule('*/10 * * * *', async () => {
    try {
      const expired = await Reel.find(
        { kind: 'story', expiresAt: { $lte: new Date() } },
        { _id: 1, cloudinaryPublicId: 1, videoUrl: 1 }
      ).limit(200);
      if (expired.length === 0) return;

      for (const story of expired) {
        await Reel.deleteOne({ _id: story._id });
        // El recuento de referencias se hace con el documento YA borrado: si el
        // mismo video se publicó también como reel o en el muro, se respeta.
        await deleteAssetIfUnused({
          publicId: story.cloudinaryPublicId,
          url: story.videoUrl,
          exceptReelId: story._id as any,
        });
      }
      log.info(`historias caducadas barridas: ${expired.length}`);
    } catch (err) {
      log.error('fallo barriendo historias caducadas', err);
    }
  });

  console.log('[cronService] Jobs started');
}

import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { ReadingPlanSubscription } from '../models/ReadingPlanSubscription';
import { listPlans, getPlan, computeCurrentDay, generateCustomPlan, BOOK_COUNT } from '../lib/readingPlans';

// Plan efectivo de una suscripción: generado si es personalizado, del catálogo si no.
function getPlanForSub(sub: any) {
  if (sub?.custom) return generateCustomPlan(sub.custom);
  return getPlan(sub.planKey);
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
      if (typeof reminderEnabled === 'boolean') doc.reminderEnabled = reminderEnabled;
      if (Number.isInteger(reminderHour)) doc.reminderHour = Math.min(23, Math.max(0, reminderHour));
      if (Number.isInteger(reminderMinute)) doc.reminderMinute = Math.min(59, Math.max(0, reminderMinute));
      const sub = await ReadingPlanSubscription.create(doc);
      res.status(201).json(shapeSubscription(sub.toObject()));
      return;
    }

    // ── Plan del catálogo ───────────────────────────────────
    const plan = getPlan(planKey);
    if (!plan) {
      res.status(400).json({ error: 'Plan no válido' });
      return;
    }
    const update: any = {
      timezone: typeof timezone === 'string' && timezone ? timezone : 'UTC',
      startDate: startDate ? new Date(startDate) : new Date(),
    };
    if (typeof reminderEnabled === 'boolean') update.reminderEnabled = reminderEnabled;
    if (Number.isInteger(reminderHour)) update.reminderHour = Math.min(23, Math.max(0, reminderHour));
    if (Number.isInteger(reminderMinute)) update.reminderMinute = Math.min(59, Math.max(0, reminderMinute));

    const sub = await ReadingPlanSubscription.findOneAndUpdate(
      { user: req.userId, planKey },
      { $set: update, $setOnInsert: { user: req.userId, planKey, completedDays: [] } },
      { upsert: true, new: true }
    ).lean();

    res.status(201).json(shapeSubscription(sub));
  } catch (err) {
    console.error('subscribePlan:', err);
    res.status(500).json({ error: 'Error al empezar el plan' });
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

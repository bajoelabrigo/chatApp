import { Response } from 'express';
import { PersonalCommitment } from '../models/PersonalCommitment';
import { ACTIVITY_META, ActivityType } from '../models/GroupActivity';
import { AuthRequest } from '../middleware/authMiddleware';

export async function getPersonalActivities(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const items = await PersonalCommitment.find({ userId, isActive: true }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Error obteniendo actividades personales' });
  }
}

export async function createPersonalActivity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { type, name, proposito, daysOfWeek, startHour, startMinute, endHour, endMinute, notificationsEnabled } = req.body;

    if (!type || !ACTIVITY_META[type as ActivityType]) {
      res.status(400).json({ error: 'Tipo de actividad inválido' }); return;
    }
    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      res.status(400).json({ error: 'Debes seleccionar al menos un día' }); return;
    }
    const startTotal = (startHour ?? 0) * 60 + (startMinute ?? 0);
    const endTotal = (endHour ?? 0) * 60 + (endMinute ?? 0);
    if (endTotal <= startTotal) {
      res.status(400).json({ error: 'La hora de término debe ser posterior a la de inicio' }); return;
    }

    const meta = ACTIVITY_META[type as ActivityType];
    const item = await PersonalCommitment.create({
      userId,
      type,
      emoji: meta.emoji,
      name: name?.trim() || meta.defaultName,
      proposito: proposito?.trim()?.slice(0, 200) || undefined,
      daysOfWeek,
      startHour: startHour ?? 7,
      startMinute: startMinute ?? 0,
      endHour: endHour ?? 8,
      endMinute: endMinute ?? 0,
      notificationsEnabled: notificationsEnabled !== false,
    });

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando actividad personal' });
  }
}

export async function updatePersonalActivity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { proposito, daysOfWeek, startHour, startMinute, endHour, endMinute, notificationsEnabled } = req.body;

    if (daysOfWeek !== undefined && (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0)) {
      res.status(400).json({ error: 'Debes seleccionar al menos un día' }); return;
    }
    if (startHour !== undefined && endHour !== undefined) {
      const startTotal = (startHour ?? 0) * 60 + (startMinute ?? 0);
      const endTotal = (endHour ?? 0) * 60 + (endMinute ?? 0);
      if (endTotal <= startTotal) {
        res.status(400).json({ error: 'La hora de término debe ser posterior a la de inicio' }); return;
      }
    }

    const updates: Record<string, any> = {};
    if (proposito !== undefined) updates.proposito = proposito?.trim()?.slice(0, 200) || undefined;
    if (daysOfWeek !== undefined) updates.daysOfWeek = daysOfWeek;
    if (startHour !== undefined) updates.startHour = startHour;
    if (startMinute !== undefined) updates.startMinute = startMinute;
    if (endHour !== undefined) updates.endHour = endHour;
    if (endMinute !== undefined) updates.endMinute = endMinute;
    if (notificationsEnabled !== undefined) updates.notificationsEnabled = notificationsEnabled;

    const updated = await PersonalCommitment.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true }
    );
    if (!updated) { res.status(404).json({ error: 'Actividad no encontrada' }); return; }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error actualizando actividad personal' });
  }
}

export async function deletePersonalActivity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    await PersonalCommitment.findOneAndUpdate({ _id: id, userId }, { $set: { isActive: false } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando actividad personal' });
  }
}

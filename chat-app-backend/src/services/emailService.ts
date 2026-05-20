import nodemailer from 'nodemailer';
import { ScheduleSlot } from '../models/ActivityCommitment';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatSlot(slot: ScheduleSlot): string {
  const day = DAY_NAMES[slot.dayOfWeek];
  const hh = String(slot.hour).padStart(2, '0');
  const mm = String(slot.minute).padStart(2, '0');
  return `${day} ${hh}:${mm}`;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendCommitmentConfirmation(
  to: string,
  userName: string,
  activityEmoji: string,
  activityName: string,
  groupName: string,
  schedule: ScheduleSlot[]
): Promise<void> {
  try {
    const scheduleHtml = schedule.map((s) => `<li>${formatSlot(s)}</li>`).join('');
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `✅ Compromiso confirmado: ${activityName}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto">
          <h2>${activityEmoji} Compromiso de ${activityName}</h2>
          <p>Hola <strong>${userName}</strong>,</p>
          <p>Te has comprometido con la actividad <strong>${activityName}</strong> en el grupo <strong>${groupName}</strong>.</p>
          <p><strong>Tu horario:</strong></p>
          <ul>${scheduleHtml}</ul>
          <p>Recibirás recordatorios antes de cada sesión. ¡Que Dios bendiga tu compromiso!</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[emailService] sendCommitmentConfirmation error:', err);
  }
}

export interface WeeklyCommitmentSummary {
  activityEmoji: string;
  activityName: string;
  groupName: string;
  schedule: ScheduleSlot[];
}

export async function sendWeeklySummary(
  to: string,
  userName: string,
  commitments: WeeklyCommitmentSummary[]
): Promise<void> {
  try {
    if (commitments.length === 0) return;
    const items = commitments
      .map(
        (c) =>
          `<li><strong>${c.activityEmoji} ${c.activityName}</strong> (${c.groupName})<br>${c.schedule.map(formatSlot).join(', ')}</li>`
      )
      .join('');
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: '📅 Resumen semanal de tus compromisos',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto">
          <h2>📅 Tu semana de actividades</h2>
          <p>Hola <strong>${userName}</strong>, aquí está tu resumen para esta semana:</p>
          <ul>${items}</ul>
          <p>¡Que tengas una semana bendecida!</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[emailService] sendWeeklySummary error:', err);
  }
}

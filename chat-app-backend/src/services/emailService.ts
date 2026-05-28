import nodemailer from 'nodemailer';

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

// ── Auth emails ─────────────────────────────────────────────

function codeHtml(title: string, subtitle: string, code: string, note: string): string {
  const digits = code.split('').map((d) =>
    `<span style="display:inline-block;width:48px;height:56px;line-height:56px;text-align:center;font-size:28px;font-weight:bold;border-radius:10px;background:#f0fdf4;border:2px solid #22c55e;color:#15803d;margin:0 4px">${d}</span>`
  ).join('');
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px 40px;text-align:center">
        <p style="margin:0;font-size:32px">💬</p>
        <h1 style="margin:12px 0 0;color:#fff;font-size:22px;font-weight:700">ChatApp</h1>
      </div>
      <div style="padding:36px 40px;text-align:center">
        <h2 style="margin:0 0 8px;color:#111;font-size:20px">${title}</h2>
        <p style="margin:0 0 28px;color:#6b7280;font-size:15px">${subtitle}</p>
        <div style="margin:0 auto 28px">${digits}</div>
        <p style="color:#9ca3af;font-size:13px">${note}</p>
      </div>
      <div style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb">
        <p style="margin:0;color:#9ca3af;font-size:12px">Si no solicitaste esto, ignora este correo.</p>
      </div>
    </div>`;
}

export async function sendVerificationCode(to: string, name: string, code: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: `"ChatApp" <${process.env.SMTP_FROM}>`,
      to,
      subject: `${code} es tu código de verificación de ChatApp`,
      html: codeHtml(
        `Hola ${name} 👋`,
        'Ingresa este código para verificar tu cuenta. Expira en <strong>10 minutos</strong>.',
        code,
        'Este código es válido por 10 minutos.'
      ),
    });
  } catch (err) {
    console.error('[emailService] sendVerificationCode error:', err);
  }
}

export async function sendPasswordResetCode(to: string, name: string, code: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: `"ChatApp" <${process.env.SMTP_FROM}>`,
      to,
      subject: `${code} es tu código para restablecer tu contraseña`,
      html: codeHtml(
        'Restablecer contraseña',
        `Hola <strong>${name}</strong>, usa este código para crear una nueva contraseña. Expira en <strong>10 minutos</strong>.`,
        code,
        'Si no solicitaste un cambio de contraseña, ignora este correo.'
      ),
    });
  } catch (err) {
    console.error('[emailService] sendPasswordResetCode error:', err);
  }
}

// ────────────────────────────────────────────────────────────

export async function sendCommitmentConfirmation(
  to: string,
  userName: string,
  activityEmoji: string,
  activityName: string,
  groupName: string,
  _schedule: unknown[]
): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `✅ Compromiso confirmado: ${activityName}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto">
          <h2>${activityEmoji} Compromiso de ${activityName}</h2>
          <p>Hola <strong>${userName}</strong>,</p>
          <p>Te has comprometido con la actividad <strong>${activityName}</strong> en el grupo <strong>${groupName}</strong>.</p>
          <p>¡Que Dios bendiga tu compromiso!</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[emailService] sendCommitmentConfirmation error:', err);
  }
}

export async function sendActivityNotification(
  to: string,
  userName: string,
  activityEmoji: string,
  activityName: string,
  groupName: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const dateRange = startDate && endDate
    ? `<p><strong>Período:</strong> ${startDate} — ${endDate}</p>`
    : startDate
    ? `<p><strong>Inicio:</strong> ${startDate}</p>`
    : '';
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `${activityEmoji} Nueva actividad en ${groupName}: ${activityName}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto">
          <h2>${activityEmoji} ${activityName}</h2>
          <p>Hola <strong>${userName}</strong>,</p>
          <p>Se ha creado una nueva actividad <strong>${activityName}</strong> en el grupo <strong>${groupName}</strong>.</p>
          ${dateRange}
          <p>Entra a la app para unirte y comprometerte. ¡Que Dios bendiga tu participación!</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[emailService] sendActivityNotification error:', err);
  }
}

export async function sendAccountDeletedEmail(to: string, name: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: `"HolyChat" <${process.env.SMTP_FROM}>`,
      to,
      subject: 'Tu cuenta de HolyChat ha sido eliminada',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="background:linear-gradient(135deg,#4338CA,#6366F1);padding:32px 40px;text-align:center">
            <p style="margin:0;font-size:32px">✝️</p>
            <h1 style="margin:12px 0 0;color:#fff;font-size:22px;font-weight:700">HolyChat</h1>
          </div>
          <div style="padding:36px 40px">
            <h2 style="margin:0 0 16px;color:#111;font-size:20px">Cuenta eliminada</h2>
            <p style="color:#374151;font-size:15px;line-height:1.6">Hola <strong>${name}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.6">
              Te confirmamos que tu cuenta de HolyChat ha sido eliminada de forma <strong>permanente e irreversible</strong>
              el día <strong>${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
            </p>
            <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:8px;padding:16px 20px;margin:24px 0">
              <p style="margin:0;color:#991B1B;font-size:14px;font-weight:600">Lo siguiente ha sido eliminado permanentemente:</p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#7F1D1D;font-size:14px;line-height:1.8">
                <li>Tu perfil, foto y datos personales</li>
                <li>Todas tus conversaciones y mensajes</li>
                <li>Tus actividades espirituales y compromisos</li>
                <li>Tus peticiones de oración</li>
                <li>Todos los archivos e imágenes que compartiste</li>
              </ul>
            </div>
            <p style="color:#374151;font-size:15px;line-height:1.6">
              Esta información <strong>no puede ser recuperada</strong>. Si eliminaste tu cuenta por error,
              deberás crear una cuenta nueva desde cero.
            </p>
            <p style="color:#6B7280;font-size:14px;line-height:1.6;margin-top:24px">
              Si tienes alguna pregunta, puedes contactarnos en
              <a href="mailto:admin@holyholyholy.es" style="color:#6366F1">admin@holyholyholy.es</a>.
            </p>
            <p style="color:#374151;font-size:15px;margin-top:24px">
              Que Dios te bendiga en tu camino. 🙏
            </p>
          </div>
          <div style="background:#F9FAFB;padding:16px 40px;text-align:center;border-top:1px solid #E5E7EB">
            <p style="margin:0;color:#9CA3AF;font-size:12px">© HolyChat · holyholyholy.es</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('[emailService] sendAccountDeletedEmail error:', err);
  }
}

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface WeeklyCommitmentSummary {
  activityEmoji: string;
  activityName: string;
  groupName: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export async function sendWeeklySummary(
  to: string,
  userName: string,
  commitments: WeeklyCommitmentSummary[]
): Promise<void> {
  try {
    if (commitments.length === 0) return;
    const items = commitments
      .map((c) => {
        const days = [...c.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_NAMES_SHORT[d]).join(', ');
        return `<li><strong>${c.activityEmoji} ${c.activityName}</strong> (${c.groupName})<br>${days} · ${fmtTime(c.startHour, c.startMinute)} → ${fmtTime(c.endHour, c.endMinute)}</li>`;
      })
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

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  createOrder,
  createInlineOrder,
  captureOrder,
  createSubscription,
  verifyWebhook,
  handleCaptureCompleted,
  handleCaptureRefunded,
  handleSubscriptionActivated,
  handleSubscriptionCancelled,
} from '../services/paypalService';
import { Offering } from '../models/Offering';
import { User } from '../models/User';
import { isGlobalAdmin } from '../services/adminService';

// Planes de suscripción mensual (montos 5/10/20/50/100/200). Cada uno es un PLAN
// de PayPal distinto; su ID viene por variable de entorno.
// Nivel de socio: TODAS las suscripciones hacen socio (insignia), pero el acceso
// a los materiales gratis es solo a partir de $20 (SOCIO_MATERIAL_MIN). Los tiers
// de $5 y $10 dan insignia únicamente.
const SUBSCRIPTION_PLANS: Record<string, string | undefined> = {
  sub_5:   process.env.PAYPAL_PLAN_SUB_5_ID,
  sub_10:  process.env.PAYPAL_PLAN_SUB_10_ID,
  sub_20:  process.env.PAYPAL_PLAN_SUB_20_ID,
  sub_50:  process.env.PAYPAL_PLAN_SUB_50_ID,
  sub_100: process.env.PAYPAL_PLAN_SUB_100_ID,
  sub_200: process.env.PAYPAL_PLAN_SUB_200_ID,
};

// Monto en USD de cada tier. Se guarda en la Offering al crear la suscripción y
// sirve de respaldo fiable para el webhook de activación (que puede llegar sin
// `last_payment` y no sabría el nivel del socio de otra forma).
const TIER_AMOUNTS: Record<string, number> = {
  sub_5: 5,
  sub_10: 10,
  sub_20: 20,
  sub_50: 50,
  sub_100: 100,
  sub_200: 200,
};

// ── Simple HTML pages shown inside expo-web-browser ──────────

function htmlPage(emoji: string, title: string, body: string, autoClose = false): string {
  const closeSnippet = autoClose
    ? `<meta http-equiv="refresh" content="2;url=chatapp://">
<script>setTimeout(function(){window.location.href='chatapp://'}, 2000);</script>`
    : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${closeSnippet}<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#F4F7FF;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{background:#fff;border-radius:20px;padding:40px 32px;text-align:center;max-width:360px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .emoji{font-size:52px;margin-bottom:16px}
  h1{font-size:22px;color:#1E293B;margin-bottom:10px}
  p{color:#64748B;font-size:15px;line-height:1.5}
</style></head><body>
<div class="card"><div class="emoji">${emoji}</div><h1>${title}</h1><p>${body}</p></div>
</body></html>`;
}

// ── One-time order ────────────────────────────────────────────

export async function createOrderCheckout(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const rawAmount = parseFloat(req.body.amount);

    if (isNaN(rawAmount) || rawAmount < 1) {
      return res.status(400).json({ error: 'Monto inválido (mínimo $1)' });
    }

    const amountUSD = rawAmount.toFixed(2);
    const { orderId, approvalUrl } = await createOrder(amountUSD, userId, req.body.web === true);

    await Offering.create({
      userId,
      paypalOrderId: orderId,
      type: 'one_time',
      amount: Math.round(rawAmount * 100),
      status: 'pending',
    });

    res.json({ approvalUrl });
  } catch (err) {
    console.error('Error creando orden PayPal:', err);
    res.status(500).json({ error: 'Error al iniciar el pago' });
  }
}

// ── One-time order (INLINE: PayPal Buttons en la página, sin redirect) ──
// La web usa este par de endpoints para ofrendar sin salir del sitio
// (el usuario paga con PayPal o tarjeta ahí mismo).

export async function createInlineOrderCheckout(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const rawAmount = parseFloat(req.body.amount);

    if (isNaN(rawAmount) || rawAmount < 1) {
      return res.status(400).json({ error: 'Monto inválido (mínimo $1)' });
    }

    const amountUSD = rawAmount.toFixed(2);
    const { orderId } = await createInlineOrder(amountUSD, userId);

    await Offering.create({
      userId,
      paypalOrderId: orderId,
      type: 'one_time',
      amount: Math.round(rawAmount * 100),
      status: 'pending',
    });

    res.json({ orderId });
  } catch (err) {
    console.error('Error creando orden inline PayPal:', err);
    res.status(500).json({ error: 'Error al iniciar el pago' });
  }
}

export async function captureInlineOrder(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const orderId = req.body.orderId as string;

    if (!orderId) {
      return res.status(400).json({ error: 'Falta el identificador de la orden' });
    }

    const capture = await captureOrder(orderId);

    if (capture?.status === 'COMPLETED') {
      const unit = capture.purchase_units?.[0];
      const captureData = unit?.payments?.captures?.[0];
      const amountCents = Math.round(parseFloat(captureData?.amount?.value ?? '0') * 100);

      // Solo confirma la ofrenda si pertenece a este usuario (evita capturar
      // una orden ajena). El webhook PAYMENT.CAPTURE.COMPLETED es idempotente.
      await Offering.findOneAndUpdate(
        { paypalOrderId: orderId, userId },
        // El id de la captura hace falta para casar un reembolso futuro.
        { $set: { status: 'paid', amount: amountCents, paypalCaptureId: captureData?.id } }
      );
      await User.findByIdAndUpdate(userId, { $set: { lastOfferingAt: new Date() } });

      return res.json({ status: 'COMPLETED', amountCents });
    }

    return res.json({ status: capture?.status ?? 'PENDING' });
  } catch (err) {
    console.error('Error capturando orden inline PayPal:', err);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
}

export async function captureOrderReturn(req: Request, res: Response) {
  const orderId = req.query.token as string;
  const isWeb = req.query.platform === 'web';
  if (!orderId) {
    return res.status(400).send(htmlPage('❌', 'Error', 'No se encontró la orden. Intenta de nuevo.'));
  }

  try {
    const capture = await captureOrder(orderId);

    if (capture?.status === 'COMPLETED') {
      const unit = capture.purchase_units?.[0];
      const captureData = unit?.payments?.captures?.[0];
      const amountCents = Math.round(parseFloat(captureData?.amount?.value ?? '0') * 100);
      const userId = unit?.custom_id;

      await Offering.findOneAndUpdate(
        { paypalOrderId: orderId },
        // El id de la captura hace falta para casar un reembolso futuro.
        { $set: { status: 'paid', amount: amountCents, paypalCaptureId: captureData?.id } }
      );

      if (userId) {
        await User.findByIdAndUpdate(userId, { $set: { lastOfferingAt: new Date() } });
      }

      return res.send(
        htmlPage('🙏', '¡Gracias por tu ofrenda!', 'Tu contribución fue recibida. Que Dios multiplique lo que has dado.', !isWeb)
      );
    }

    return res.send(htmlPage('⏳', 'Procesando', 'Tu pago está siendo verificado. Puedes cerrar esta ventana.'));
  } catch (err) {
    console.error('Error capturando orden PayPal:', err);
    return res.send(htmlPage('❌', 'Error al procesar', 'Hubo un problema. Si se realizó el pago, será reflejado en breve.'));
  }
}

export function cancelReturn(req: Request, res: Response) {
  res.send(htmlPage('↩️', 'Ofrenda cancelada', 'No se realizó ningún cargo.', req.query.platform !== 'web'));
}

// ── Subscriptions ─────────────────────────────────────────────

export async function createSubscriptionCheckout(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { tier } = req.body;

    const planId = SUBSCRIPTION_PLANS[tier];
    if (!planId) {
      return res.status(400).json({ error: 'Tier de suscripción no válido' });
    }

    const { subscriptionId, approvalUrl } = await createSubscription(planId, userId, req.body.web === true);

    await Offering.create({
      userId,
      paypalSubscriptionId: subscriptionId,
      type: 'subscription',
      // Guardamos el monto del tier (en centavos) como respaldo para el webhook.
      amount: (TIER_AMOUNTS[tier] || 0) * 100,
      status: 'pending',
    });

    res.json({ approvalUrl });
  } catch (err) {
    console.error('Error creando suscripción PayPal:', err);
    res.status(500).json({ error: 'Error al iniciar la suscripción' });
  }
}

export function subReturn(req: Request, res: Response) {
  res.send(htmlPage('🎉', '¡Suscripción activada!', 'Tu ofrenda mensual está activa. ¡Gracias por tu fidelidad!', req.query.platform !== 'web'));
}

export function subCancel(req: Request, res: Response) {
  res.send(htmlPage('↩️', 'Suscripción cancelada', 'No se realizó ningún cargo.', req.query.platform !== 'web'));
}

// ── History & status ──────────────────────────────────────────

export async function getOfferingHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const offerings = await Offering.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(offerings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
}

export async function getMyOfferingStatus(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const user = await User.findById(userId).select('isActiveSubscriber lastOfferingAt').lean();
    const userObjectId = new Types.ObjectId(userId);
    const totalOfferings = await Offering.countDocuments({ userId, status: 'paid' });
    const totalAmount = await Offering.aggregate([
      { $match: { userId: userObjectId, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      isActiveSubscriber: user?.isActiveSubscriber ?? false,
      lastOfferingAt: user?.lastOfferingAt ?? null,
      totalOfferings,
      totalAmountCents: totalAmount[0]?.total ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo estado' });
  }
}

// Fecha de "solo día" (yyyy-mm-dd) → mediodía UTC, para que no se muestre un día
// antes en zonas detrás de UTC (América). Ver la nota en holy_app/utils/dateOnly.js.
function parseDateOnly(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + 'T12:00:00.000Z');
  }
  return value ? new Date(value) : new Date();
}

// ── Admin: ofrendas manuales + reporte ────────────────────────
// El admin general (web) registra a mano las ofrendas que llegan por fuera del
// PayPal de la app (transferencia, efectivo, Zelle…) y lista todas las ofrendas.
// Autorización: bypass isGlobalAdmin (role:'admin' en la colección compartida).

// POST /offerings/admin/manual — registra una ofrenda única recibida por fuera.
export async function createManualOffering(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general' });
    }
    const { userId, donorName, donorEmail, amount, method, note, receivedAt } = req.body || {};
    const usd = Number(amount);
    if (!usd || usd <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    if (!userId && !donorName && !donorEmail) {
      return res.status(400).json({ error: 'Indica un usuario o el nombre/email del donante' });
    }

    const doc = await Offering.create({
      userId: userId || undefined,
      type: 'one_time',
      amount: Math.round(usd * 100), // guardado en centavos, como el resto
      currency: 'usd',
      status: 'paid',
      source: 'manual',
      method: method || 'otro',
      note: note || undefined,
      donorName: donorName || undefined,
      donorEmail: donorEmail || undefined,
      registeredBy: requesterId,
      receivedAt: parseDateOnly(receivedAt),
    });

    res.status(201).json({ message: 'Ofrenda registrada', offering: doc });
  } catch (err) {
    console.error('createManualOffering:', err);
    res.status(500).json({ error: 'Error registrando la ofrenda' });
  }
}

// PUT /offerings/admin/:id — edita una ofrenda MANUAL (nunca una de PayPal: esa
// la generó una captura real y editarla la desincroniza de lo que PayPal sabe
// que cobró; para corregir un cobro de PayPal está anular).
export async function updateManualOffering(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general' });
    }
    const off = await Offering.findById(req.params.id);
    if (!off) return res.status(404).json({ error: 'No encontrada' });
    if (off.source !== 'manual') {
      return res.status(400).json({ error: 'Solo se pueden editar las ofrendas manuales' });
    }

    const { userId, donorName, donorEmail, amount, method, note, receivedAt } = req.body || {};
    const usdAmount = Number(amount);
    if (!usdAmount || usdAmount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    if (!userId && !donorName && !donorEmail) {
      return res.status(400).json({ error: 'Indica un usuario o el nombre/email del donante' });
    }

    off.userId = userId || undefined;
    off.donorName = userId ? undefined : donorName || undefined;
    off.donorEmail = userId ? undefined : donorEmail || undefined;
    off.amount = Math.round(usdAmount * 100);
    off.method = method || 'otro';
    off.note = note || undefined;
    off.receivedAt = parseDateOnly(receivedAt);
    await off.save();

    res.json({ message: 'Ofrenda actualizada', offering: off });
  } catch (err) {
    console.error('updateManualOffering:', err);
    res.status(500).json({ error: 'Error actualizando la ofrenda' });
  }
}

// GET /offerings/admin — todas las ofrendas pagadas (PayPal + manuales) + totales.
export async function listAdminOfferings(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general' });
    }

    // Se incluyen las reembolsadas y las anuladas: el panel tiene que MOSTRARLAS
    // (con su motivo) aunque no sumen. Un ingreso que desaparece de la vista sin
    // dejar rastro es justo lo que impide explicar un descuadre meses después.
    const offerings = await Offering.find({ status: { $in: ['paid', 'refunded'] } })
      .populate('userId', 'name email avatar')
      .sort({ receivedAt: -1, createdAt: -1 })
      .limit(500)
      .lean();

    // Totales (en USD) del mes y del año en curso. La fecha efectiva es
    // receivedAt si existe, si no createdAt.
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    // Neto: lo anulado no cuenta y lo reembolsado se descuenta (parciales incluidos).
    const sumSince = async (since: Date) => {
      const r = await Offering.aggregate([
        { $match: { status: 'paid', voided: { $ne: true } } },
        { $addFields: { eff: { $ifNull: ['$receivedAt', '$createdAt'] } } },
        { $match: { eff: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $subtract: ['$amount', { $ifNull: ['$refundedAmount', 0] }] } },
          },
        },
      ]);
      return (r[0]?.total ?? 0) / 100;
    };
    const [month, year] = await Promise.all([sumSince(startMonth), sumSince(startYear)]);

    res.json({ offerings, totals: { month, year } });
  } catch (err) {
    console.error('listAdminOfferings:', err);
    res.status(500).json({ error: 'Error obteniendo ofrendas' });
  }
}

// POST /offerings/admin/:id/void — ANULA una ofrenda (cualquiera, no solo las
// manuales: una de PayPal puede ser un cobro erróneo o un contracargo que no
// llegó por webhook). Body: { reason?, undo? }.
//
// En contabilidad no se borra: se anula. El registro sigue visible con su motivo
// y fuera de los totales — es lo único que permite explicar un descuadre meses
// después de que ocurriera.
export async function voidOffering(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general' });
    }
    const off = await Offering.findById(req.params.id);
    if (!off) return res.status(404).json({ error: 'No encontrada' });

    const undo = !!req.body?.undo;
    off.voided = !undo;
    off.voidReason = undo ? undefined : String(req.body?.reason || '').slice(0, 300);
    off.voidedAt = undo ? undefined : new Date();
    off.voidedBy = undo ? undefined : requesterId;
    await off.save();

    res.json({ message: undo ? 'Anulación deshecha' : 'Ofrenda anulada' });
  } catch (err) {
    console.error('voidOffering:', err);
    res.status(500).json({ error: 'Error anulando la ofrenda' });
  }
}

// DELETE /offerings/admin/:id — se mantiene por compatibilidad con clientes ya
// desplegados, pero YA NO BORRA: anula, como el endpoint de arriba. Borrar de
// verdad dejaba un ingreso sin rastro y era imposible auditar nada.
export async function deleteManualOffering(req: Request, res: Response) {
  try {
    const requesterId = (req as any).userId;
    if (!(await isGlobalAdmin(requesterId))) {
      return res.status(403).json({ error: 'Solo el admin general' });
    }
    const off = await Offering.findById(req.params.id);
    if (!off) return res.status(404).json({ error: 'No encontrada' });

    off.voided = true;
    off.voidReason = 'Eliminada desde el panel';
    off.voidedAt = new Date();
    off.voidedBy = requesterId;
    await off.save();

    res.json({ message: 'Ofrenda anulada' });
  } catch (err) {
    console.error('deleteManualOffering:', err);
    res.status(500).json({ error: 'Error anulando la ofrenda' });
  }
}

// ── Webhook ───────────────────────────────────────────────────

export async function handleWebhook(req: Request, res: Response) {
  const isValid = await verifyWebhook(
    req.headers as Record<string, string>,
    req.body
  );

  if (!isValid) {
    return res.status(403).json({ error: 'Webhook inválido' });
  }

  const eventType: string = req.body?.event_type ?? '';

  try {
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handleCaptureCompleted(req.body);
        break;
      // Devolución o contracargo: deja de contar como ingreso.
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
        await handleCaptureRefunded(req.body);
        break;
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(req.body);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionCancelled(req.body);
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error procesando webhook PayPal:', eventType, err);
    res.status(500).json({ error: 'Error interno' });
  }
}

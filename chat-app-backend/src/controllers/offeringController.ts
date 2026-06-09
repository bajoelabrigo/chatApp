import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  createOrder,
  captureOrder,
  createSubscription,
  verifyWebhook,
  handleCaptureCompleted,
  handleSubscriptionActivated,
  handleSubscriptionCancelled,
} from '../services/paypalService';
import { Offering } from '../models/Offering';
import { User } from '../models/User';

const SUBSCRIPTION_PLANS: Record<string, string | undefined> = {
  sub_5:  process.env.PAYPAL_PLAN_SUB_5_ID,
  sub_10: process.env.PAYPAL_PLAN_SUB_10_ID,
  sub_20: process.env.PAYPAL_PLAN_SUB_20_ID,
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
        { $set: { status: 'paid', amount: amountCents } }
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
      amount: 0,
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

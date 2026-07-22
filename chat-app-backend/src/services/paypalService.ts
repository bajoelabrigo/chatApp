import { Offering } from '../models/Offering';
import { User } from '../models/User';
import { sendSocioWelcome } from './emailService';
import { sendExpoPushToUsers } from './pushService';
import { sendWebPushToUser } from './webPushService';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://holyholyholy.es';

// Efectos al hacerse SOCIO por suscripción: correo + push (Expo + web). El flag
// socioWelcomePending (para el modal) ya se marcó en el $set del ascenso.
async function triggerSocioWelcome(userId: string): Promise<void> {
  try {
    const user = await User.findById(userId).select('name email').lean();
    if (!user?.email) return;
    await sendSocioWelcome(user.email, user.name || 'amigo', `${FRONTEND_URL}/materiales`);
  } catch (err) {
    console.error('[paypalService] socio email error:', err);
  }
  const title = '🛡️ ¡Ahora eres Socio!';
  const body = 'Gracias por tu ofrenda. Ya tienes tu insignia y acceso gratis a más de 100 estudios.';
  sendExpoPushToUsers([userId], { title, body, data: { type: 'socio' } });
  sendWebPushToUser(userId, { title, body, url: '/materiales', tag: 'socio' });
}

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function paypalFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PayPal API ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json().catch(() => null);
}

export async function createOrder(
  amountUSD: string,
  userId: string,
  isWeb = false
): Promise<{ orderId: string; approvalUrl: string }> {
  const base = process.env.BACKEND_URL!;
  // En web, la página de retorno NO debe redirigir a chatapp:// (eso es del móvil).
  const q = isWeb ? '?platform=web' : '';
  const order = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amountUSD },
          custom_id: userId,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${base}/offerings/capture${q}`,
            cancel_url: `${base}/offerings/cancel${q}`,
            user_action: 'PAY_NOW',
          },
        },
      },
    }),
  });

  const approvalUrl = order.links?.find((l: any) => l.rel === 'payer-action')?.href;
  if (!approvalUrl) throw new Error('No se obtuvo URL de aprobación de PayPal');
  return { orderId: order.id, approvalUrl };
}

// Orden "simple" para el flujo INLINE (PayPal Buttons en la página, sin redirect).
// No fija `payment_source`, así el pago con PayPal Y con tarjeta quedan elegibles.
export async function createInlineOrder(
  amountUSD: string,
  userId: string
): Promise<{ orderId: string }> {
  const order = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amountUSD },
          custom_id: userId,
        },
      ],
    }),
  });
  if (!order?.id) throw new Error('No se obtuvo la orden de PayPal');
  return { orderId: order.id };
}

export async function captureOrder(orderId: string): Promise<any> {
  return paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createSubscription(
  planId: string,
  userId: string,
  isWeb = false
): Promise<{ subscriptionId: string; approvalUrl: string }> {
  const base = process.env.BACKEND_URL!;
  const q = isWeb ? '?platform=web' : '';
  const sub = await paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      application_context: {
        return_url: `${base}/offerings/sub-return${q}`,
        cancel_url: `${base}/offerings/sub-cancel${q}`,
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  });

  const approvalUrl = sub.links?.find((l: any) => l.rel === 'approve')?.href;
  if (!approvalUrl) throw new Error('No se obtuvo URL de aprobación de suscripción');
  return { subscriptionId: sub.id, approvalUrl };
}

export async function verifyWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: any
): Promise<boolean> {
  try {
    const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        transmission_id: headers['paypal-transmission-id'],
        transmission_time: headers['paypal-transmission-time'],
        cert_url: headers['paypal-cert-url'],
        auth_algo: headers['paypal-auth-algo'],
        transmission_sig: headers['paypal-transmission-sig'],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: body,
      }),
    });
    return result?.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

// ── Webhook event handlers ──────────────────────────────────

export async function handleCaptureCompleted(event: any): Promise<void> {
  const capture = event.resource;
  const orderId = capture?.supplementary_data?.related_ids?.order_id ?? capture?.id;
  const userId = capture?.custom_id;
  const amountCents = Math.round(parseFloat(capture?.amount?.value ?? '0') * 100);

  await Offering.findOneAndUpdate(
    { paypalOrderId: orderId },
    { $set: { status: 'paid', amount: amountCents } }
  );

  if (userId) {
    await User.findByIdAndUpdate(userId, { $set: { lastOfferingAt: new Date() } });
  }
}

// Umbral de ofrenda mensual que da acceso a los materiales gratis. Los tiers por
// debajo ($5, $10) hacen socio (insignia) pero NO desbloquean materiales.
// Espejo de SOCIO_MATERIAL_MIN en holy_app/backend/controllers/userController.js.
const SOCIO_MATERIAL_MIN = 20;

export async function handleSubscriptionActivated(event: any): Promise<void> {
  const sub = event.resource;
  const userId = sub?.custom_id;
  const paidCents = Math.round(
    parseFloat(sub?.billing_info?.last_payment?.amount?.value ?? '0') * 100
  );

  // El webhook de activación puede llegar sin `last_payment`; en ese caso usamos
  // el monto del tier que se guardó en la Offering pendiente al crear la
  // suscripción (así sabemos el nivel real del socio: $5/$10 vs $20+).
  const existing = await Offering.findOne({ paypalSubscriptionId: sub.id }).lean();
  const amountCents = paidCents > 0 ? paidCents : (Number((existing as any)?.amount) || 0);

  await Offering.findOneAndUpdate(
    { paypalSubscriptionId: sub.id },
    {
      $set: {
        userId,
        paypalSubscriptionId: sub.id,
        type: 'subscription',
        amount: amountCents,
        status: 'paid',
      },
    },
    { upsert: true }
  );

  if (userId) {
    // Al suscribirse a la ofrenda mensual, el usuario se hace SOCIO
    // automáticamente (insignia). El acceso a materiales gratis solo desde $20
    // (socioAmount >= SOCIO_MATERIAL_MIN). socioSince solo se establece la
    // primera vez para no perder la antigüedad al renovar.
    const before = await User.findById(userId).select('isSocio socioAmount').lean();
    const wasSocio = !!before?.isSocio;
    const oldAmount = Number((before as any)?.socioAmount) || 0;
    // Monto real de la suscripción (NO se fuerza a 20): así un socio de $5/$10
    // queda con insignia pero sin acceso a materiales.
    const newAmount = Math.round(amountCents / 100) || 0;
    const wasFull = wasSocio && oldAmount >= SOCIO_MATERIAL_MIN;
    const nowFull = newAmount >= SOCIO_MATERIAL_MIN;
    // La bienvenida (correo/push/modal) solo en el ASCENSO: socio nuevo, o mejora
    // de <$20 a acceso completo. Nunca en una renovación del mismo nivel.
    const shouldWelcome = !wasSocio || (!wasFull && nowFull);
    await User.findByIdAndUpdate(userId, {
      $set: {
        isActiveSubscriber: true,
        lastOfferingAt: new Date(),
        isSocio: true,
        socioAmount: newAmount,
        ...(shouldWelcome ? { socioWelcomePending: true } : {}),
      },
    });
    await User.updateOne(
      { _id: userId, socioSince: { $exists: false } },
      { $set: { socioSince: new Date() } }
    );
    if (shouldWelcome) await triggerSocioWelcome(userId);
  }
}

export async function handleSubscriptionCancelled(event: any): Promise<void> {
  const sub = event.resource;
  const userId = sub?.custom_id;

  await Offering.findOneAndUpdate(
    { paypalSubscriptionId: sub.id },
    { $set: { status: 'cancelled' } }
  );

  if (userId) {
    const still = await Offering.findOne({ userId, type: 'subscription', status: 'paid' });
    if (!still) {
      // Sin suscripción activa deja de ser socio. (Un socio otorgado a mano por
      // un admin que nunca se suscribió no entra aquí: no tiene Offering.)
      await User.findByIdAndUpdate(userId, {
        $set: { isActiveSubscriber: false, isSocio: false },
      });
    }
  }
}

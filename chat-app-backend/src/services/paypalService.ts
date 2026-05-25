import { Offering } from '../models/Offering';
import { User } from '../models/User';

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
  userId: string
): Promise<{ orderId: string; approvalUrl: string }> {
  const base = process.env.BACKEND_URL!;
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
            return_url: `${base}/offerings/capture`,
            cancel_url: `${base}/offerings/cancel`,
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

export async function captureOrder(orderId: string): Promise<any> {
  return paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createSubscription(
  planId: string,
  userId: string
): Promise<{ subscriptionId: string; approvalUrl: string }> {
  const base = process.env.BACKEND_URL!;
  const sub = await paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      application_context: {
        return_url: `${base}/offerings/sub-return`,
        cancel_url: `${base}/offerings/sub-cancel`,
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

export async function handleSubscriptionActivated(event: any): Promise<void> {
  const sub = event.resource;
  const userId = sub?.custom_id;
  const amountCents = Math.round(
    parseFloat(sub?.billing_info?.last_payment?.amount?.value ?? '0') * 100
  );

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
    await User.findByIdAndUpdate(userId, {
      $set: { isActiveSubscriber: true, lastOfferingAt: new Date() },
    });
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
      await User.findByIdAndUpdate(userId, { $set: { isActiveSubscriber: false } });
    }
  }
}

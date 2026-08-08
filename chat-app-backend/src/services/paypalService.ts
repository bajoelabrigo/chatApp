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

// GET genérico, para el script de backfill (consultar capturas/órdenes/
// transacciones de suscripción viejas que no tienen comisión guardada).
export async function paypalGet(path: string): Promise<any> {
  return paypalFetch(path, { method: 'GET' });
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

// PayPal nunca deposita el bruto: `seller_receivable_breakdown.paypal_fee` es
// lo que se queda. Mismo shape en el webhook, en la respuesta directa de
// captura/orden y en el backfill histórico — una sola función para leerlo.
export function feeCentsFromCapture(capture: any): number {
  const fee = capture?.seller_receivable_breakdown?.paypal_fee?.value;
  return fee ? Math.round(parseFloat(fee) * 100) : 0;
}

export async function handleCaptureCompleted(event: any): Promise<void> {
  const capture = event.resource;
  const orderId = capture?.supplementary_data?.related_ids?.order_id ?? capture?.id;
  const userId = capture?.custom_id;
  const amountCents = Math.round(parseFloat(capture?.amount?.value ?? '0') * 100);
  const feeCents = feeCentsFromCapture(capture);

  await Offering.findOneAndUpdate(
    { paypalOrderId: orderId },
    // Se guarda el id de la CAPTURA: es por donde llega un reembolso más tarde.
    { $set: { status: 'paid', amount: amountCents, paypalCaptureId: capture?.id, feeAmount: feeCents } }
  );

  if (userId) {
    await User.findByIdAndUpdate(userId, { $set: { lastOfferingAt: new Date() } });
  }
}

// El enlace `up` de un reembolso apunta a la captura que se devolvió:
// https://api.paypal.com/v2/payments/captures/<captureId>
export function captureIdFromRefund(refund: any): string | undefined {
  const up = (refund?.links || []).find((l: any) => l?.rel === 'up')?.href;
  const fromLink = typeof up === 'string' ? up.split('/').pop() : undefined;
  return refund?.supplementary_data?.related_ids?.capture_id || fromLink || undefined;
}

// Cuánto queda devuelto y en qué estado queda la ofrenda tras un reembolso.
// Separado del acceso a la base para poder probarlo: los reembolsos parciales y
// los repetidos (PayPal reenvía webhooks) son fáciles de equivocar.
export function applyRefund(
  amount: number,
  alreadyRefunded: number,
  refundedNow: number
): { refundedAmount: number; fullyRefunded: boolean } {
  const total = Math.min((Number(alreadyRefunded) || 0) + refundedNow, Number(amount) || 0);
  return { refundedAmount: total, fullyRefunded: total >= (Number(amount) || 0) };
}

// PAYMENT.CAPTURE.REFUNDED / .REVERSED — el dinero se devolvió (o hubo
// contracargo). Sin esto la ofrenda seguía contando como ingreso PARA SIEMPRE.
//
// Se guarda el importe devuelto en vez de tocar `amount`: así un reembolso
// PARCIAL también cuadra (el ingreso neto es amount - refundedAmount) y no se
// pierde de cuánto fue la ofrenda original.
export async function handleCaptureRefunded(event: any): Promise<void> {
  const refund = event.resource;
  const refundedCents = Math.round(parseFloat(refund?.amount?.value ?? '0') * 100);
  if (!refundedCents) return;

  const captureId = captureIdFromRefund(refund);
  const orderId = refund?.supplementary_data?.related_ids?.order_id;

  // Las capturas anteriores a 2026-08 no guardaron su id: se cae al de la orden.
  const query = captureId
    ? { $or: [{ paypalCaptureId: captureId }, { paypalOrderId: captureId }] }
    : orderId
    ? { paypalOrderId: orderId }
    : null;

  const offering = query ? await Offering.findOne(query) : null;

  if (!offering) {
    // No se silencia: es dinero que salió y el panel no lo sabe. Hay que poder
    // buscarlo en el log y anular la ofrenda a mano desde Ingresos.
    console.error(
      'PayPal: reembolso sin ofrenda que le corresponda —',
      JSON.stringify({ refundId: refund?.id, captureId, orderId, refundedCents })
    );
    return;
  }

  const { refundedAmount, fullyRefunded } = applyRefund(
    offering.amount,
    offering.refundedAmount ?? 0,
    refundedCents
  );

  offering.refundedAmount = refundedAmount;
  offering.refundedAt = new Date();
  // Solo se marca 'refunded' si se devolvió TODO; un parcial sigue siendo pagada.
  if (fullyRefunded) offering.status = 'refunded';
  await offering.save();
}

// ── Cobros recurrentes de suscripción (PAYMENT.SALE.*) ──────────────────────
//
// BILLING.SUBSCRIPTION.ACTIVATED solo llega UNA VEZ, al activarse. Los cobros
// de los meses siguientes los notifica el evento clásico PAYMENT.SALE.COMPLETED
// (la API de Suscripciones sigue facturando con el motor viejo de Payments por
// debajo). Sin manejar este evento, el mes 1 se registraba como ingreso y el
// resto de la vida del socio, no.

// Extracción pura del evento (testable sin tocar la base de datos).
export function parseSaleEvent(sale: any): {
  saleId?: string;
  subscriptionId?: string;
  amountCents: number;
  feeCents: number;
  userId?: string;
  receivedAt: Date;
} {
  return {
    saleId: sale?.id,
    subscriptionId: sale?.billing_agreement_id,
    amountCents: Math.round(parseFloat(sale?.amount?.total ?? '0') * 100),
    feeCents: Math.round(parseFloat(sale?.transaction_fee?.value ?? '0') * 100),
    userId: sale?.custom || undefined,
    receivedAt: sale?.create_time ? new Date(sale.create_time) : new Date(),
  };
}

// Crea o reclama la fila de Offering para UN cobro de suscripción (por su sale
// id de PayPal). La usan el webhook y el script de backfill histórico —una
// sola lógica, para que no diverjan.
//
// - Si el sale id ya está guardado: no-op (PayPal reenvía webhooks) salvo que
//   le falte la comisión (backfill).
// - Si no: intenta RECLAMAR la fila que se creó al activarse (mes 1, sin sale
//   id todavía) en vez de duplicar el ingreso.
// - Si esa fila ya está reclamada por otro cobro: es una renovación → fila
//   nueva. `paypalSaleId` es único, así que un reenvío en carrera choca con
//   un duplicado y se ignora en vez de crear dos filas.
export async function reconcileSubscriptionSale(input: {
  subscriptionId: string;
  saleId: string;
  amountCents: number;
  feeCents: number;
  receivedAt: Date;
  userId?: string;
}): Promise<void> {
  const { subscriptionId, saleId, amountCents, feeCents, receivedAt, userId } = input;

  const already = await Offering.findOne({ paypalSaleId: saleId }).select('_id feeAmount').lean();
  if (already) {
    if (!(already as any).feeAmount && feeCents) {
      await Offering.updateOne({ _id: (already as any)._id }, { $set: { feeAmount: feeCents } });
    }
    return;
  }

  const claimed = await Offering.findOneAndUpdate(
    { paypalSubscriptionId: subscriptionId, paypalSaleId: { $exists: false } },
    {
      $set: {
        paypalSaleId: saleId,
        feeAmount: feeCents,
        status: 'paid',
        ...(amountCents > 0 ? { amount: amountCents } : {}),
      },
    },
    { sort: { createdAt: 1 } }
  );
  if (claimed) return;

  try {
    await Offering.create({
      userId,
      paypalSubscriptionId: subscriptionId,
      paypalSaleId: saleId,
      type: 'subscription',
      amount: amountCents,
      feeAmount: feeCents,
      status: 'paid',
      receivedAt,
    });
  } catch (err: any) {
    if (err?.code !== 11000) throw err; // 11000 = ya lo creó un webhook en carrera
  }
}

export async function handleSaleCompleted(event: any): Promise<void> {
  const { saleId, subscriptionId, amountCents, feeCents, userId: rawUserId, receivedAt } =
    parseSaleEvent(event.resource);
  if (!saleId || !subscriptionId) return; // no es un cobro de suscripción

  // `custom` debería traer el userId (se pasó como custom_id al crear la
  // suscripción), pero por si alguna vez llega vacío se recupera de la fila
  // de activación — sin userId no se puede refrescar lastOfferingAt ni casar
  // la ofrenda por usuario en el libro de cuentas.
  let userId = rawUserId;
  if (!userId) {
    const existing = await Offering.findOne({ paypalSubscriptionId: subscriptionId })
      .select('userId')
      .lean();
    userId = (existing as any)?.userId ? String((existing as any).userId) : undefined;
  }

  await reconcileSubscriptionSale({ subscriptionId, saleId, amountCents, feeCents, receivedAt, userId });

  if (userId) {
    await User.findByIdAndUpdate(userId, { $set: { lastOfferingAt: new Date() } });
  }
}

// PAYMENT.SALE.REFUNDED / .REVERSED — reembolso o contracargo de UN cobro
// recurrente. El recurso es el reembolso; `sale_id` apunta al cobro original
// (equivalente al enlace `up` de un reembolso v2, pero el evento clásico lo
// da directo).
export async function handleSaleRefunded(event: any): Promise<void> {
  const refund = event.resource;
  const refundedCents = Math.round(parseFloat(refund?.amount?.total ?? '0') * 100);
  if (!refundedCents) return;

  const saleId = refund?.sale_id;
  const offering = saleId ? await Offering.findOne({ paypalSaleId: saleId }) : null;

  if (!offering) {
    console.error(
      'PayPal: reembolso de suscripción sin ofrenda que le corresponda —',
      JSON.stringify({ refundId: refund?.id, saleId, refundedCents })
    );
    return;
  }

  const { refundedAmount, fullyRefunded } = applyRefund(
    offering.amount,
    offering.refundedAmount ?? 0,
    refundedCents
  );
  offering.refundedAmount = refundedAmount;
  offering.refundedAt = new Date();
  if (fullyRefunded) offering.status = 'refunded';
  await offering.save();
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
        // PayPal cobra solo cada mes → NO es socio manual y no debe recibir
        // recordatorios de pago. Se limpia cualquier aviso manual previo.
        socioManual: false,
        socioPaymentReminder: false,
        socioOverdue: false,
        socioReminderStage: 0,
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

// ── Búsqueda de transacciones (ofrendas recibidas por fuera de la app) ──────
//
// Alguien puede mandarle dinero directo a la cuenta de PayPal del ministerio
// (PayPal.me, "Enviar a un amigo", un pago que no pasó por nuestro checkout…)
// sin que exista ningún orderId/subscriptionId nuestro con qué casarlo — por
// eso esas ofrendas se registran a mano. La API de Transaction Search SÍ tiene
// el dato (comisión, nombre y correo del pagador): el admin busca por
// fecha/monto en vez de teclear la comisión copiándola de PayPal a ojo.

export async function searchPaypalTransactions(startDate: Date, endDate: Date): Promise<any[]> {
  const qs = new URLSearchParams({
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    fields: 'all',
    page_size: '100',
  });
  const res = await paypalGet(`/v1/reporting/transactions?${qs}`);
  return res?.transaction_details || [];
}

// Extracción pura (testable): de un item crudo de Transaction Search a lo que
// necesita el admin para elegir. Descarta lo que no sirve como candidato de
// ofrenda: pagos SALIENTES (comisiones de terceros, suscripciones que
// pagamos nosotros) y transacciones que no llegaron a completarse.
export function parseTransactionCandidate(t: any): {
  transactionId: string;
  date: Date;
  amountCents: number;
  feeCents: number;
  payerName: string;
  payerEmail: string;
} | null {
  const ti = t?.transaction_info;
  const amount = parseFloat(ti?.transaction_amount?.value ?? '0');
  if (!ti?.transaction_id || !(amount > 0)) return null; // solo dinero ENTRANTE
  if (ti?.transaction_status && ti.transaction_status !== 'S') return null; // solo completadas

  const fee = Math.abs(parseFloat(ti?.fee_amount?.value ?? '0'));
  const payer = t?.payer_info;
  const name =
    payer?.payer_name?.alternate_full_name ||
    [payer?.payer_name?.given_name, payer?.payer_name?.surname].filter(Boolean).join(' ');

  return {
    transactionId: ti.transaction_id,
    date: ti.transaction_initiation_date ? new Date(ti.transaction_initiation_date) : new Date(),
    amountCents: Math.round(amount * 100),
    feeCents: Math.round(fee * 100),
    payerName: name || '',
    payerEmail: payer?.email_address || '',
  };
}

/**
 * Rellena la comisión de PayPal (feeAmount) de las ofrendas ya cobradas, y de
 * paso reconstruye las renovaciones mensuales de suscripción que nunca se
 * registraron (antes de que el webhook manejara PAYMENT.SALE.COMPLETED —
 * ver paypalService.ts). Sin esto, "Contabilidad" venía sumando el bruto y
 * solo contaba el primer mes de cada socio suscrito por PayPal.
 *
 * Es un script de LECTURA de PayPal + escritura puntual en Mongo. No borra ni
 * anula nada; si una fila ya tiene feeAmount, se salta.
 *
 * Uso (con el .env del backend, o del VPS si se corre ahí):
 *   cd chat-app-backend
 *   npx ts-node src/scripts/backfillPaypalFees.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Offering } from '../models/Offering';
import { paypalGet, feeCentsFromCapture, reconcileSubscriptionSale } from '../services/paypalService';

// PayPal limita /transactions a ventanas de ~1 año.
const WINDOW_MS = 350 * 24 * 60 * 60 * 1000;

async function backfillOneTime() {
  const targets = await Offering.find({
    type: 'one_time',
    source: { $ne: 'manual' },
    status: { $in: ['paid', 'refunded'] },
    $or: [{ feeAmount: { $exists: false } }, { feeAmount: 0 }],
    $and: [{ $or: [{ paypalCaptureId: { $exists: true } }, { paypalOrderId: { $exists: true } }] }],
  }).lean();

  console.log(`\n— Ofrendas únicas sin comisión: ${targets.length}`);
  let ok = 0;
  let skipped = 0;

  for (const o of targets) {
    try {
      let captureData: any = null;
      if (o.paypalCaptureId) {
        captureData = await paypalGet(`/v2/payments/captures/${o.paypalCaptureId}`);
      } else if (o.paypalOrderId) {
        const order = await paypalGet(`/v2/checkout/orders/${o.paypalOrderId}`);
        captureData = order?.purchase_units?.[0]?.payments?.captures?.[0];
      }

      const feeCents = feeCentsFromCapture(captureData);
      if (!feeCents) {
        skipped++;
        continue;
      }

      const set: Record<string, unknown> = { feeAmount: feeCents };
      // De paso se rellena el id de captura si faltaba (ofrendas anteriores a
      // 2026-08 solo guardaron el de la orden).
      if (!o.paypalCaptureId && captureData?.id) set.paypalCaptureId = captureData.id;

      await Offering.updateOne({ _id: o._id }, { $set: set });
      ok++;
    } catch (err) {
      console.error(`  ! ${o._id}:`, (err as Error).message);
    }
  }
  console.log(`  actualizadas: ${ok}, sin comisión reportada: ${skipped}`);
}

async function backfillSubscriptions() {
  // Solo las que llegaron a ACTIVARSE tienen historial en PayPal. Un checkout
  // de suscripción abandonado (el usuario nunca aprobó) se queda en 'pending'
  // para siempre y su subscriptionId no existe del lado de PayPal — consultarlo
  // da 404 y solo ensucia el log.
  const subscriptionIds: string[] = await Offering.distinct('paypalSubscriptionId', {
    type: 'subscription',
    status: 'paid',
    paypalSubscriptionId: { $exists: true, $ne: null },
  });
  const abandoned = await Offering.countDocuments({
    type: 'subscription',
    status: { $ne: 'paid' },
    paypalSubscriptionId: { $exists: true, $ne: null },
  });

  console.log(
    `\n— Suscripciones a reconciliar: ${subscriptionIds.length}` +
      (abandoned ? ` (+ ${abandoned} checkouts abandonados, nunca aprobados en PayPal — se ignoran)` : '')
  );

  for (const subscriptionId of subscriptionIds) {
    const first = await Offering.findOne({ paypalSubscriptionId: subscriptionId })
      .sort({ createdAt: 1 })
      .select('userId createdAt')
      .lean();
    const userId = (first as any)?.userId ? String((first as any).userId) : undefined;
    const since = (first as any)?.createdAt ? new Date((first as any).createdAt) : new Date(0);

    let transactions: any[] = [];
    try {
      transactions = await fetchAllTransactions(subscriptionId, since);
    } catch (err) {
      console.error(`  ! ${subscriptionId}: no se pudo leer el historial —`, (err as Error).message);
      continue;
    }

    const completed = transactions.filter((t) => t.status === 'COMPLETED');
    let created = 0;
    let claimed = 0;
    let feeFilled = 0;

    for (const t of completed) {
      const saleId = t.id;
      if (!saleId) continue;
      const amountCents = Math.round(
        parseFloat(t.amount_with_breakdown?.gross_amount?.value ?? '0') * 100
      );
      const feeCents = Math.round(
        parseFloat(t.amount_with_breakdown?.fee_amount?.value ?? '0') * 100
      );
      const receivedAt = t.time ? new Date(t.time) : new Date();

      const before = await Offering.findOne({ paypalSaleId: saleId }).select('_id').lean();
      await reconcileSubscriptionSale({ subscriptionId, saleId, amountCents, feeCents, receivedAt, userId });

      if (before) feeFilled++;
      else {
        const claimedNow = await Offering.findOne({
          paypalSubscriptionId: subscriptionId,
          paypalSaleId: saleId,
          createdAt: { $lt: receivedAt },
        }).lean();
        if (claimedNow) claimed++;
        else created++;
      }
    }

    if (completed.length) {
      console.log(
        `  ${subscriptionId}: ${completed.length} cobros · ${claimed} mes-1 reclamado, ${created} filas nuevas, ${feeFilled} solo comisión`
      );
    }
  }
}

async function fetchAllTransactions(subscriptionId: string, since: Date): Promise<any[]> {
  const all: any[] = [];
  let windowStart = since.getTime();
  const now = Date.now();

  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + WINDOW_MS, now);
    const qs = new URLSearchParams({
      start_time: new Date(windowStart).toISOString(),
      end_time: new Date(windowEnd).toISOString(),
    });
    try {
      const res = await paypalGet(`/v1/billing/subscriptions/${subscriptionId}/transactions?${qs}`);
      for (const t of res?.transactions || []) all.push(t);
    } catch (err) {
      console.error(`    ! ventana ${qs}:`, (err as Error).message);
    }
    windowStart = windowEnd + 1000;
  }
  return all;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no está definido en .env');
  await mongoose.connect(uri);
  console.log('MongoDB conectado. PAYPAL_MODE =', process.env.PAYPAL_MODE || '(sandbox)');

  await backfillOneTime();
  await backfillSubscriptions();

  await mongoose.disconnect();
  console.log('\nListo. ✅');
}

main().catch((err) => {
  console.error('Error en el backfill:', err);
  process.exit(1);
});

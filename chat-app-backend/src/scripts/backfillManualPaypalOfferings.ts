/**
 * Vincula retroactivamente las ofrendas MANUALES marcadas "paypal" (alguien
 * mandó dinero directo a la cuenta, registrado a mano antes de que existiera
 * el buscador) con su transacción real de PayPal: les pone `paypalCaptureId`
 * (para que ya no se puedan registrar dos veces) y `feeAmount` (la comisión
 * real, en vez de $0).
 *
 * Solo vincula cuando hay EXACTAMENTE una transacción candidata (mismo
 * importe al centavo, ±3 días de la fecha registrada, no usada ya por otra
 * Offering); si hay varias del mismo importe, intenta desempatar por nombre
 * del pagador. Lo que queda ambiguo o sin encontrar se imprime para revisar
 * a mano — nunca adivina.
 *
 * Uso:
 *   cd chat-app-backend
 *   npx ts-node src/scripts/backfillManualPaypalOfferings.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Offering } from '../models/Offering';
import { User } from '../models/User';
import { searchPaypalTransactions, parseTransactionCandidate } from '../services/paypalService';

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 3;

function normalize(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes (NFD las separa como marcas combinantes)
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

async function userName(userId: any): Promise<string> {
  const u = await User.findById(userId).select('name').lean();
  return (u as any)?.name || '';
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no está definido en .env');
  await mongoose.connect(uri);
  console.log('MongoDB conectado. PAYPAL_MODE =', process.env.PAYPAL_MODE || '(sandbox)');

  const targets = await Offering.find({
    source: 'manual',
    method: 'paypal',
    paypalCaptureId: { $exists: false },
  }).lean();

  console.log(`\nOfrendas manuales "paypal" sin vincular: ${targets.length}`);

  const already = new Set(
    (
      await Offering.find({ paypalCaptureId: { $exists: true, $ne: null } })
        .select('paypalCaptureId')
        .lean()
    ).map((o: any) => o.paypalCaptureId)
  );
  // Reservadas dentro de esta corrida: dos ofrendas manuales del mismo importe
  // no pueden reclamar la misma transacción.
  const claimedThisRun = new Set<string>();

  let linked = 0;
  let ambiguous = 0;
  let noMatch = 0;

  for (const o of targets as any[]) {
    const center = new Date(o.receivedAt || o.createdAt);
    const start = new Date(center.getTime() - WINDOW_DAYS * DAY);
    const end = new Date(Math.min(center.getTime() + WINDOW_DAYS * DAY, Date.now()));
    const who = o.donorName || (o.userId ? await userName(o.userId) : '') || o.donorEmail || '(sin nombre)';

    let raw: any[] = [];
    try {
      raw = await searchPaypalTransactions(start, end);
    } catch (err) {
      console.error(`  ! ${who}:`, (err as Error).message);
      continue;
    }

    const candidates: any[] = raw
      .map(parseTransactionCandidate)
      .filter(
        (c: any) =>
          c &&
          c.amountCents === o.amount &&
          !already.has(c.transactionId) &&
          !claimedThisRun.has(c.transactionId)
      );

    let pick: any = null;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else if (candidates.length > 1) {
      const byName = candidates.filter((c: any) => namesMatch(c.payerName, who));
      if (byName.length === 1) pick = byName[0];
    }

    if (pick) {
      await Offering.updateOne(
        { _id: o._id },
        { $set: { paypalCaptureId: pick.transactionId, feeAmount: pick.feeCents } }
      );
      claimedThisRun.add(pick.transactionId);
      linked++;
      console.log(
        `  ✓ ${who}: $${(o.amount / 100).toFixed(2)} → ${pick.transactionId} (comisión $${(
          pick.feeCents / 100
        ).toFixed(2)})`
      );
    } else if (candidates.length > 1) {
      ambiguous++;
      console.log(
        `  ? ${who}: $${(o.amount / 100).toFixed(2)} tiene ${candidates.length} candidatos, ninguno calza por nombre — revisar a mano:`
      );
      for (const c of candidates) {
        console.log(`      - ${c.transactionId} · ${c.payerName || c.payerEmail} · ${c.date.toISOString()}`);
      }
    } else {
      noMatch++;
      console.log(`  ✗ ${who}: $${(o.amount / 100).toFixed(2)} (${center.toDateString()}) sin transacción que calce`);
    }
  }

  console.log(`\nVinculadas: ${linked} · Ambiguas: ${ambiguous} · Sin encontrar: ${noMatch}`);

  await mongoose.disconnect();
  console.log('Listo. ✅');
}

main().catch((err) => {
  console.error('Error en el backfill:', err);
  process.exit(1);
});

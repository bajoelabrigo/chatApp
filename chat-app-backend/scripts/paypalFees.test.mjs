// Pruebas de la comisión de PayPal y de los cobros recurrentes de suscripción:
//   npm run build && node scripts/paypalFees.test.mjs
// (importa desde dist/, así que hay que compilar antes).
import assert from "node:assert/strict";
import test from "node:test";
import {
  feeCentsFromCapture,
  parseSaleEvent,
  parseTransactionCandidate,
} from "../dist/services/paypalService.js";

// Payload real de una captura v2 (webhook PAYMENT.CAPTURE.COMPLETED o
// respuesta directa de /v2/checkout/orders/{id}/capture): el bruto NO es lo
// que se deposita.
const captureWithFee = {
  id: "8MC585209K746392H",
  amount: { value: "40.00", currency_code: "USD" },
  seller_receivable_breakdown: {
    gross_amount: { value: "40.00", currency_code: "USD" },
    paypal_fee: { value: "1.47", currency_code: "USD" },
    net_amount: { value: "38.53", currency_code: "USD" },
  },
};

test("saca la comisión en centavos de seller_receivable_breakdown", () => {
  assert.equal(feeCentsFromCapture(captureWithFee), 147);
});

test("sin breakdown no inventa comisión", () => {
  assert.equal(feeCentsFromCapture({ id: "x" }), 0);
  assert.equal(feeCentsFromCapture(null), 0);
});

test("comisión de $0.00 (promo) da 0, no NaN", () => {
  assert.equal(
    feeCentsFromCapture({
      seller_receivable_breakdown: { paypal_fee: { value: "0.00" } },
    }),
    0
  );
});

// Evento clásico PAYMENT.SALE.COMPLETED de un cobro RECURRENTE de suscripción
// (no llega por PAYMENT.CAPTURE.COMPLETED).
const saleEvent = {
  id: "9AB123456C789012D",
  amount: { total: "20.00", currency: "USD" },
  transaction_fee: { value: "0.88", currency: "USD" },
  billing_agreement_id: "I-BW452GLLEP1G",
  custom: "665f1b2c9a0e1a2b3c4d5e6f",
  create_time: "2026-08-01T12:00:00Z",
};

test("parseSaleEvent lee monto, comisión, suscripción y usuario", () => {
  const parsed = parseSaleEvent(saleEvent);
  assert.equal(parsed.saleId, "9AB123456C789012D");
  assert.equal(parsed.subscriptionId, "I-BW452GLLEP1G");
  assert.equal(parsed.amountCents, 2000);
  assert.equal(parsed.feeCents, 88);
  assert.equal(parsed.userId, "665f1b2c9a0e1a2b3c4d5e6f");
  assert.equal(parsed.receivedAt.toISOString(), "2026-08-01T12:00:00.000Z");
});

test("parseSaleEvent sin custom_id no revienta (se resuelve por la Offering existente)", () => {
  const parsed = parseSaleEvent({ ...saleEvent, custom: undefined });
  assert.equal(parsed.userId, undefined);
});

test("parseSaleEvent sin create_time cae a 'ahora', no a Invalid Date", () => {
  const parsed = parseSaleEvent({ ...saleEvent, create_time: undefined });
  assert.ok(!Number.isNaN(parsed.receivedAt.getTime()));
});

// ── Búsqueda de transacciones (ofrendas recibidas por fuera de la app) ──────
// Item real de /v1/reporting/transactions (visto en producción: Ketys
// Cristales mandó $100 directo a la cuenta y PayPal se quedó con $5.70).
const ketysTx = {
  transaction_info: {
    transaction_id: "9PH68796C4814304P",
    transaction_status: "S",
    transaction_initiation_date: "2026-08-07T17:54:56Z",
    transaction_amount: { value: "100.00", currency_code: "USD" },
    fee_amount: { value: "-5.70", currency_code: "USD" },
  },
  payer_info: {
    email_address: "kety@example.com",
    payer_name: { alternate_full_name: "Ketys Cristales" },
  },
};

test("parseTransactionCandidate lee un pago entrante real", () => {
  const c = parseTransactionCandidate(ketysTx);
  assert.equal(c.transactionId, "9PH68796C4814304P");
  assert.equal(c.amountCents, 10000);
  assert.equal(c.feeCents, 570, "la comisión viene en negativo, se guarda en positivo");
  assert.equal(c.payerName, "Ketys Cristales");
  assert.equal(c.payerEmail, "kety@example.com");
});

test("un pago SALIENTE (comisión de suscripción, etc.) no es candidato", () => {
  const saliente = {
    transaction_info: {
      transaction_id: "4N9332452T612421U",
      transaction_status: "S",
      transaction_amount: { value: "-59.90", currency_code: "USD" },
    },
  };
  assert.equal(parseTransactionCandidate(saliente), null);
});

test("una transacción denegada o pendiente no es candidato", () => {
  const pendiente = {
    transaction_info: {
      transaction_id: "X",
      transaction_status: "P",
      transaction_amount: { value: "40.00" },
    },
  };
  assert.equal(parseTransactionCandidate(pendiente), null);
});

test("sin nombre alternativo, arma el nombre con given_name + surname", () => {
  const c = parseTransactionCandidate({
    transaction_info: {
      transaction_id: "Y",
      transaction_status: "S",
      transaction_amount: { value: "10.00" },
    },
    payer_info: { payer_name: { given_name: "Italo", surname: "Jara" } },
  });
  assert.equal(c.payerName, "Italo Jara");
});

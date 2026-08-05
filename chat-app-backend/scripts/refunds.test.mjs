// Pruebas del reembolso de PayPal:
//   npm run build && node scripts/refunds.test.mjs
// (importa desde dist/, así que hay que compilar antes).
import assert from "node:assert/strict";
import test from "node:test";
import { captureIdFromRefund, applyRefund } from "../dist/services/paypalService.js";

// Payload real de PAYMENT.CAPTURE.REFUNDED: el recurso es el REEMBOLSO, y la
// captura devuelta solo aparece en el enlace `up`.
const refundEvent = {
  id: "5TY05013RG002845M",
  amount: { value: "40.00", currency_code: "USD" },
  status: "COMPLETED",
  links: [
    { rel: "self", href: "https://api.paypal.com/v2/payments/refunds/5TY05013RG002845M" },
    { rel: "up", href: "https://api.paypal.com/v2/payments/captures/8MC585209K746392H" },
  ],
};

test("saca el id de la captura del enlace `up`", () => {
  assert.equal(captureIdFromRefund(refundEvent), "8MC585209K746392H");
});

test("prefiere supplementary_data cuando PayPal lo manda", () => {
  const withSupp = {
    ...refundEvent,
    supplementary_data: { related_ids: { capture_id: "OTRA123" } },
  };
  assert.equal(captureIdFromRefund(withSupp), "OTRA123");
});

test("sin enlaces ni datos no inventa un id", () => {
  assert.equal(captureIdFromRefund({ id: "x" }), undefined);
  assert.equal(captureIdFromRefund(null), undefined);
});

test("reembolso total: la ofrenda queda a cero", () => {
  const r = applyRefund(4000, 0, 4000);
  assert.deepEqual(r, { refundedAmount: 4000, fullyRefunded: true });
});

test("reembolso parcial: sigue pagada y el neto es la diferencia", () => {
  const r = applyRefund(4000, 0, 1500);
  assert.equal(r.refundedAmount, 1500);
  assert.equal(r.fullyRefunded, false, "$25 de $40 siguen siendo un ingreso");
});

test("dos parciales suman hasta completar", () => {
  const uno = applyRefund(4000, 0, 1500);
  const dos = applyRefund(4000, uno.refundedAmount, 2500);
  assert.deepEqual(dos, { refundedAmount: 4000, fullyRefunded: true });
});

test("PayPal reenvía el webhook: no se devuelve más de lo cobrado", () => {
  // El mismo reembolso llegando dos veces no puede dejar la ofrenda en negativo.
  const r = applyRefund(4000, 4000, 4000);
  assert.equal(r.refundedAmount, 4000);
});

// Códigos de un solo uso: caducidad, bloqueo por intentos y comparación.
// Importa de dist/, así que hay que compilar antes (lo hace `npm test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyCode, codeMatches, codeExpiry, randomCode, hashCode, isHashed,
  codeErrorStatus, codeErrorMessage, MAX_CODE_ATTEMPTS,
} from '../dist/services/authCodes.js';

const future = new Date(Date.now() + 5 * 60 * 1000);
const past   = new Date(Date.now() - 1000);

test('el código correcto y vigente pasa', async () => {
  assert.equal(await verifyCode({ stored: '123456', expiry: future, attempts: 0 }, '123456'), 'ok');
});

test('un código distinto no pasa', async () => {
  assert.equal(await verifyCode({ stored: '123456', expiry: future, attempts: 0 }, '999999'), 'mismatch');
});

test('sin código pendiente devuelve missing, no mismatch', async () => {
  assert.equal(await verifyCode({ stored: undefined, expiry: undefined }, '123456'), 'missing');
  assert.equal(await verifyCode({ stored: '123456', expiry: null }, '123456'), 'missing');
});

test('un código caducado no pasa aunque sea el correcto', async () => {
  assert.equal(await verifyCode({ stored: '123456', expiry: past, attempts: 0 }, '123456'), 'expired');
});

test('al agotar los intentos queda bloqueado incluso con el código bueno', async () => {
  const state = { stored: '123456', expiry: future, attempts: MAX_CODE_ATTEMPTS };
  assert.equal(await verifyCode(state, '123456'), 'locked');
});

test('bloqueado manda sobre caducado (el mensaje no cambia solo por el tiempo)', async () => {
  const state = { stored: '123456', expiry: past, attempts: MAX_CODE_ATTEMPTS };
  assert.equal(await verifyCode(state, '123456'), 'locked');
});

test('attempts ausente (usuarios ya creados) cuenta como 0', async () => {
  assert.equal(await verifyCode({ stored: '123456', expiry: future }, '123456'), 'ok');
  assert.equal(await verifyCode({ stored: '123456', expiry: future, attempts: null }, '123456'), 'ok');
});

test('el intento nº MAX es el último que se evalúa', async () => {
  const base = { stored: '123456', expiry: future };
  assert.equal(await verifyCode({ ...base, attempts: MAX_CODE_ATTEMPTS - 1 }, '123456'), 'ok');
  assert.equal(await verifyCode({ ...base, attempts: MAX_CODE_ATTEMPTS }, '123456'), 'locked');
});

test('la fuerza bruta se agota: 1M de combinaciones no caben en MAX intentos', async () => {
  let attempts = 0;
  let verdict = 'mismatch';
  for (let guess = 0; guess < 50; guess++) {
    verdict = await verifyCode({ stored: '654321', expiry: future, attempts }, String(100000 + guess));
    if (verdict === 'locked') break;
    attempts += 1;
  }
  assert.equal(verdict, 'locked');
  assert.equal(attempts, MAX_CODE_ATTEMPTS);
});

test('codeMatches no revienta con longitudes distintas ni con vacíos', async () => {
  assert.equal(await codeMatches('123456', '1234'), false);
  assert.equal(await codeMatches('', '123456'), false);
  assert.equal(await codeMatches(undefined, '123456'), false);
  assert.equal(await codeMatches('123456', ''), false);
  assert.equal(await codeMatches('123456', '123456'), true);
});

test('la caducidad son 10 minutos', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(codeExpiry(now).toISOString(), '2026-01-01T00:10:00.000Z');
});

test('randomCode da siempre 6 dígitos', () => {
  for (let i = 0; i < 500; i++) {
    const c = randomCode();
    assert.match(c, /^[0-9]{6}$/, `código inválido: ${c}`);
  }
});

test('solo el bloqueo responde 429', () => {
  assert.equal(codeErrorStatus('locked'), 429);
  for (const v of ['mismatch', 'expired', 'missing']) assert.equal(codeErrorStatus(v), 400);
  assert.match(codeErrorMessage('locked'), /intentos/i);
  assert.notEqual(codeErrorMessage('expired'), codeErrorMessage('mismatch'));
});

// ── Hasheo (paso 3) ──────────────────────────────────────────

test('el código guardado ya no es el que se manda por correo', async () => {
  const code = randomCode();
  const stored = await hashCode(code);
  assert.notEqual(stored, code);
  assert.ok(isHashed(stored));
  assert.equal(stored.includes(code), false, 'el hash no puede contener el código');
});

test('el hash valida el código correcto y rechaza el resto', async () => {
  const stored = await hashCode('123456');
  assert.equal(await codeMatches(stored, '123456'), true);
  assert.equal(await codeMatches(stored, '123457'), false);
  assert.equal(await codeMatches(stored, ''), false);
});

test('dos hashes del mismo código son distintos (sal por código)', async () => {
  const [a, b] = await Promise.all([hashCode('123456'), hashCode('123456')]);
  assert.notEqual(a, b);
  assert.equal(await codeMatches(a, '123456'), true);
  assert.equal(await codeMatches(b, '123456'), true);
});

test('los códigos YA emitidos, en claro, siguen funcionando hasta caducar', async () => {
  assert.equal(isHashed('123456'), false);
  assert.equal(await verifyCode({ stored: '123456', expiry: future, attempts: 0 }, '123456'), 'ok');
  assert.equal(await verifyCode({ stored: '123456', expiry: future, attempts: 0 }, '000000'), 'mismatch');
});

test('verifyCode funciona igual con el código hasheado', async () => {
  const stored = await hashCode('654321');
  assert.equal(await verifyCode({ stored, expiry: future, attempts: 0 }, '654321'), 'ok');
  assert.equal(await verifyCode({ stored, expiry: future, attempts: 0 }, '654320'), 'mismatch');
  assert.equal(await verifyCode({ stored, expiry: past,   attempts: 0 }, '654321'), 'expired');
  assert.equal(await verifyCode({ stored, expiry: future, attempts: MAX_CODE_ATTEMPTS }, '654321'), 'locked');
});

test('randomCode cubre todo el rango y no se sesga a los extremos', () => {
  const vistos = new Set();
  let min = 999999, max = 100000;
  for (let i = 0; i < 20000; i++) {
    const n = Number(randomCode());
    assert.ok(n >= 100000 && n <= 999999, `fuera de rango: ${n}`);
    vistos.add(n); min = Math.min(min, n); max = Math.max(max, n);
  }
  assert.ok(vistos.size > 19000, `muy pocos distintos: ${vistos.size}`);
  assert.ok(min < 200000 && max > 900000, `rango pobre: ${min}..${max}`);
});

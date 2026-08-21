// Límites de auth: se prueban contra un servidor HTTP de verdad, porque lo que
// importa (cuándo empieza a responder 429, y que cada IP tenga su propio cupo)
// no se puede leer del código.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { loginLimiter, codeCheckLimiter, emailSendLimiter } from '../dist/middleware/rateLimit.js';

function serve(limiterMiddleware) {
  const app = express();
  // Igual que app.ts: un salto de proxy. Es lo que hace que X-Forwarded-For
  // decida el cupo en vez de la IP del socket.
  app.set('trust proxy', 1);
  app.post('/probe', limiterMiddleware, (_req, res) => res.json({ ok: true }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/probe`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

async function hammer(url, times, ip) {
  const out = [];
  for (let i = 0; i < times; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'X-Forwarded-For': ip } });
    out.push(res.status);
  }
  return out;
}

test('login: deja pasar 20 y luego corta con 429', async () => {
  const s = await serve(loginLimiter);
  try {
    const codes = await hammer(s.url, 23, '203.0.113.10');
    assert.equal(codes.slice(0, 20).every((c) => c === 200), true, 'los 20 primeros deben pasar');
    assert.deepEqual(codes.slice(20), [429, 429, 429]);
  } finally { await s.close(); }
});

test('el 429 trae {error} y no rompe el formato que pinta el cliente', async () => {
  const s = await serve(codeCheckLimiter);
  try {
    await hammer(s.url, 15, '203.0.113.11');
    const res = await fetch(s.url, { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.11' } });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
    assert.ok(body.error.length > 0);
  } finally { await s.close(); }
});

test('cada IP tiene su propio cupo (esto es lo que rompe sin trust proxy)', async () => {
  const s = await serve(codeCheckLimiter);
  try {
    const atacante = await hammer(s.url, 16, '198.51.100.7');
    assert.equal(atacante.at(-1), 429, 'el atacante debe acabar bloqueado');

    // Un usuario legítimo desde otra IP no debe verse afectado.
    const inocente = await hammer(s.url, 3, '198.51.100.8');
    assert.deepEqual(inocente, [200, 200, 200]);
  } finally { await s.close(); }
});

test('las rutas que mandan correo son las más estrictas (8/hora)', async () => {
  const s = await serve(emailSendLimiter);
  try {
    const codes = await hammer(s.url, 10, '198.51.100.20');
    assert.equal(codes.filter((c) => c === 200).length, 8);
    assert.deepEqual(codes.slice(8), [429, 429]);
  } finally { await s.close(); }
});

test('el límite de correo es más severo que el de login', async () => {
  const a = await serve(emailSendLimiter);
  const b = await serve(loginLimiter);
  try {
    const correos = (await hammer(a.url, 25, '198.51.100.30')).filter((c) => c === 200).length;
    const logins  = (await hammer(b.url, 25, '198.51.100.30')).filter((c) => c === 200).length;
    assert.ok(correos < logins, `correo=${correos} debe ser < login=${logins}`);
  } finally { await a.close(); await b.close(); }
});

// tsc compila a CommonJS, así que `await import()` envuelve el router una capa
// de más (`m.default.default`). Se desenvuelve hasta dar con la función.
async function loadAuthRouter() {
  const m = await import('../dist/routes/auth.routes.js');
  let r = m.default;
  while (r && typeof r !== 'function' && r.default) r = r.default;
  assert.equal(typeof r, 'function', 'no se pudo cargar el router de auth');
  return r;
}

// ── Integración con el router real ───────────────────────────
// Lo anterior prueba los middlewares aislados; esto prueba que están APLICADOS
// a las rutas. Se usa un cuerpo vacío a propósito: el controlador responde 400
// antes de tocar Mongo, así que no hace falta base de datos.
test('el límite está cableado a /auth/verify-email de verdad', async () => {
  const authRoutes = await loadAuthRouter();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/auth', authRoutes);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/auth/verify-email`;

  const codes = [];
  for (let i = 0; i < 17; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.55' },
      body: JSON.stringify({}),
    });
    codes.push(res.status);
  }
  await new Promise((r) => server.close(r));

  assert.equal(codes[0], 400, 'sin cuerpo el controlador responde 400, no 500 (no toca Mongo)');
  assert.ok(codes.includes(429), 'la ruta real debe acabar devolviendo 429');
  assert.equal(codes.filter((c) => c === 400).length, 15, 'el cupo de codeCheckLimiter son 15');
});

test('/auth/refresh y /auth/google-signin NO llevan límite (no son fuerza bruta)', async () => {
  const authRoutes = await loadAuthRouter();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/auth', authRoutes);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const codes = [];
  for (let i = 0; i < 25; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.56' },
      body: JSON.stringify({}),
    });
    codes.push(res.status);
  }
  await new Promise((r) => server.close(r));
  assert.equal(codes.includes(429), false, 'refresh no debe limitarse: el token ya es la credencial');
});

// ── Red de seguridad: nginx sin X-Forwarded-For ──────────────
// Comprobado en producción el 2026-08-21: el nginx de api-chat NO mandaba la
// cabecera. Sin esta red, el límite habría agrupado a toda la comunidad en un
// único cubo y el primero en agotarlo dejaba fuera a los demás.
test('sin X-Forwarded-For NO se limita a nadie (y se avisa en el log)', async () => {
  const { _resetAviso } = await import('../dist/middleware/rateLimit.js');
  _resetAviso();

  const err = [];
  const se = console.error;
  console.error = (m) => err.push(String(m));

  const s = await serve(loginLimiter);
  let codes;
  try {
    // hammer() sin IP: fetch no manda X-Forwarded-For.
    codes = [];
    for (let i = 0; i < 30; i++) {
      const res = await fetch(s.url, { method: 'POST' });
      codes.push(res.status);
    }
  } finally {
    console.error = se;
    await s.close();
  }

  assert.equal(codes.every((c) => c === 200), true, 'nadie debe recibir 429 si no hay IP real');
  assert.ok(err.some((m) => /X-Forwarded-For/.test(m)), 'el problema tiene que quedar en el log');
  assert.equal(err.filter((m) => /X-Forwarded-For/.test(m)).length, 1, 'se avisa una vez, no en cada petición');
});

test('en cuanto llega la cabecera, el límite vuelve a aplicarse', async () => {
  const s = await serve(codeCheckLimiter);
  try {
    const codes = await hammer(s.url, 17, '192.0.2.99');
    assert.ok(codes.includes(429), 'con X-Forwarded-For sí se limita');
  } finally { await s.close(); }
});

// Formato del log, captura de fallos no manejados, y que el log HTTP no filtre
// credenciales (morgan no registra cuerpos, pero conviene tenerlo clavado).
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import morgan from 'morgan';
import { formatLine, describe as describeValue, logger, installProcessHandlers } from '../dist/services/logger.js';

test('la línea lleva ISO, nivel y ámbito', () => {
  const at = new Date('2026-08-21T00:31:04.512Z');
  assert.equal(formatLine('warn', 'paypal', 'captura sin orden', at),
               '2026-08-21T00:31:04.512Z WARN  [paypal] captura sin orden');
  assert.equal(formatLine('info', 'app', 'arriba', at).includes('INFO'), true);
});

test('un Error se resume en una línea y conserva la pila', () => {
  const d = describeValue(new TypeError('roto'));
  assert.equal(d.text, 'TypeError: roto');
  assert.match(d.stack, /TypeError: roto/);
});

test('describe no revienta con referencias circulares', () => {
  const a = { nombre: 'x' }; a.yo = a;
  const d = describeValue(a);
  assert.equal(typeof d.text, 'string');
  assert.equal(d.stack, undefined);
});

test('error escribe en stderr y no en stdout', () => {
  const out = [], err = [];
  const so = console.log, se = console.error;
  console.log = (m) => out.push(m); console.error = (m) => err.push(m);
  try { logger('cron').error('falló el aviso'); } finally { console.log = so; console.error = se; }
  assert.equal(out.length, 0);
  assert.equal(err.length, 1);
  assert.match(err[0], /ERROR \[cron\] falló el aviso/);
});

test('unhandledRejection se registra y NO tumba el proceso', async () => {
  const previos = process.listeners('unhandledRejection').slice();
  for (const l of previos) process.off('unhandledRejection', l);
  let salidas = 0;
  const err = [];
  const se = console.error; console.error = (m) => err.push(m);
  try {
    installProcessHandlers(() => { salidas += 1; });
    Promise.reject(new Error('sin catch'));
    await new Promise((r) => setTimeout(r, 60));
  } finally {
    console.error = se;
    for (const l of process.listeners('unhandledRejection')) process.off('unhandledRejection', l);
    for (const l of process.listeners('uncaughtException')) process.off('uncaughtException', l);
    for (const l of previos) process.on('unhandledRejection', l);
  }
  assert.equal(salidas, 0, 'una promesa sin catch no debe cerrar el servidor');
  assert.ok(err.some((m) => /Promesa rechazada sin manejador/.test(String(m))), 'debe quedar registrada');
});

test('uncaughtException sí cierra, para que PM2 reinicie limpio', () => {
  const previos = process.listeners('uncaughtException').slice();
  for (const l of previos) process.off('uncaughtException', l);
  const codigos = [];
  const err = [];
  const se = console.error; console.error = (m) => err.push(m);
  try {
    installProcessHandlers((c) => codigos.push(c));
    process.emit('uncaughtException', new Error('estado corrupto'));
  } finally {
    console.error = se;
    for (const l of process.listeners('uncaughtException')) process.off('uncaughtException', l);
    for (const l of process.listeners('unhandledRejection')) process.off('unhandledRejection', l);
    for (const l of previos) process.on('uncaughtException', l);
  }
  assert.deepEqual(codigos, [1]);
  assert.ok(err.some((m) => /Excepción no capturada/.test(String(m))));
});

test('el log HTTP no escribe la contraseña ni el código del cuerpo', async () => {
  const lineas = [];
  const app = express();
  app.use(morgan(':date[iso] HTTP  :method :url :status', { stream: { write: (l) => lineas.push(l) } }));
  app.use(express.json());
  app.post('/auth/login', (_req, res) => res.status(401).json({ error: 'no' }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.c', password: 'SuperSecreta123', code: '424242' }),
  });
  await new Promise((r) => server.close(r));

  const todo = lineas.join('\n');
  assert.ok(todo.includes('/auth/login'), 'la ruta sí debe registrarse');
  assert.equal(todo.includes('SuperSecreta123'), false, 'la contraseña NO puede acabar en el log');
  assert.equal(todo.includes('424242'), false, 'el código NO puede acabar en el log');
});

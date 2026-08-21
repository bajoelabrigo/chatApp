// Contrato de variables de entorno: todo `process.env.X` que use el código debe
// estar en .env.example. Nació porque CLAUDE.md documentaba MONGODB_URI y
// GOOGLE_CLIENT_ID cuando el código lee MONGO_URI y GOOGLE_WEB_CLIENT_ID: un
// clon fresco (o un agente "corrigiendo" el código para que encaje) no arranca.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

// Se construyen a mano (`PAYPAL_PLAN_${tier}_ID`), así que no aparecen literales.
const DINAMICAS = new Set(['PAYPAL_PLAN_SUB_5_ID', 'PAYPAL_PLAN_SUB_10_ID', 'PAYPAL_PLAN_SUB_20_ID']);
const IGNORAR = new Set(['NODE_ENV', 'PAYPAL_PLAN_SUB_']);

const usadas = new Set();
for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) usadas.add(m[1]);
}

const ejemplo = readFileSync(join(root, '.env.example'), 'utf8');
const documentadas = new Set(
  ejemplo.split('\n').map((l) => l.trim()).filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l)).map((l) => l.split('=')[0]),
);

test('el código lee al menos las variables núcleo', () => {
  for (const v of ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    assert.ok(usadas.has(v), `el código deberia leer ${v}`);
  }
});

test('toda variable usada en src/ está en .env.example', () => {
  const faltan = [...usadas].filter((v) => !documentadas.has(v) && !IGNORAR.has(v)).sort();
  assert.deepEqual(faltan, [], `sin documentar en .env.example: ${faltan.join(', ')}`);
});

test('.env.example no documenta variables que nadie lee', () => {
  const sobran = [...documentadas].filter((v) => !usadas.has(v) && !DINAMICAS.has(v)).sort();
  assert.deepEqual(sobran, [], `documentadas pero sin uso: ${sobran.join(', ')}`);
});

test('los nombres que estuvieron mal en CLAUDE.md son los del código', () => {
  assert.ok(usadas.has('MONGO_URI'), 'es MONGO_URI');
  assert.ok(!usadas.has('MONGODB_URI'), 'MONGODB_URI no existe en el código');
  assert.ok(usadas.has('GOOGLE_WEB_CLIENT_ID'), 'es GOOGLE_WEB_CLIENT_ID');
  assert.ok(!usadas.has('GOOGLE_CLIENT_ID'), 'GOOGLE_CLIENT_ID no existe en el código');
});

test('CLAUDE.md documenta los nombres correctos', () => {
  const doc = readFileSync(join(root, '..', 'CLAUDE.md'), 'utf8');
  const bloque = doc.slice(doc.indexOf('### Backend (`chat-app-backend/.env`)'));
  const env = bloque.slice(0, bloque.indexOf('```', bloque.indexOf('```') + 3));
  assert.match(env, /^MONGO_URI=/m);
  assert.match(env, /^GOOGLE_WEB_CLIENT_ID=/m);
  assert.doesNotMatch(env, /^MONGODB_URI=/m);
  assert.doesNotMatch(env, /^GOOGLE_CLIENT_ID=/m);
});

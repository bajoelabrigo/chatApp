// /notifications tardaba 3,6 s en responder — incluso un 304 — porque hacia 14
// consultas a Atlas EN FILA. A ~250 ms de latencia por viaje, eso es la suma.
// Este test vigila la estructura, no el resultado: un `await` suelto nuevo ahi
// dentro vuelve a sumar un viaje entero y nadie lo notaria hasta ver el log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/controllers/notificationController.ts'), 'utf8');

function cuerpoDe(nombre) {
  const ini = src.indexOf(`export async function ${nombre}`);
  assert.ok(ini > -1, `no existe ${nombre}`);
  const resto = src.slice(ini + 10);
  const sig = resto.indexOf('\nexport ');
  return sig === -1 ? resto : resto.slice(0, sig);
}

const cuerpo = cuerpoDe('getNotifications');

// 2 Promise.all + las 3 que dependen de un resultado anterior:
//   voters      <- myPolls        (los nombres de quienes votaron)
//   activities  <- myCommitments  (a que actividades me compromettí)
//   seen        <- recentMaterials (cuales ya vi)
const MAX_AWAITS = 5;

test('getNotifications no encadena consultas: como mucho 5 await', () => {
  const awaits = cuerpo.match(/await\s+[A-Za-z_.]+/g) ?? [];
  assert.ok(
    awaits.length <= MAX_AWAITS,
    `hay ${awaits.length} await (max ${MAX_AWAITS}). Si has añadido una consulta, ` +
    `métela en el Promise.all en vez de encadenar otro viaje a Atlas:\n  ` +
    awaits.join('\n  '),
  );
});

test('las consultas independientes se lanzan juntas', () => {
  const lote = cuerpo.slice(cuerpo.indexOf('] = await Promise.all(['));
  for (const q of [
    'q_unreadAgg', 'q_missedCalls', 'q_prayers', 'q_myPrayers', 'q_myPolls',
    'q_myReels', 'q_reelsConMisComentarios', 'q_myCommitments', 'q_tzDoc', 'q_groupCommitments',
    'q_personalCommitments', 'q_recentMaterials',
  ]) {
    assert.ok(lote.includes(q), `${q} deberia ir dentro del Promise.all`);
  }
});

test('una Query definida fuera del await no toca la base todavia', () => {
  // Es lo que hace segura la refactorizacion: `Model.find()` devuelve una Query
  // perezosa; sin await/then/exec no hay viaje. Si alguien le añade .exec() o
  // un await a una de las q_*, se ejecutaria suelta y volveriamos a encadenar.
  const decls = cuerpo.match(/const q_[A-Za-z]+ = [^;]+;/gs) ?? [];
  assert.equal(decls.length, 12, `esperaba 12 consultas declaradas, hay ${decls.length}`);
  for (const d of decls) {
    assert.equal(/\bawait\b/.test(d), false, `no debe llevar await:\n${d}`);
    assert.equal(/\.exec\(\)/.test(d), false, `no debe llevar .exec():\n${d}`);
  }
});

test('las que dependen de tener grupos siguen condicionadas', () => {
  // Sin grupos no hay peticiones de oracion ni actividades que mirar: lanzar
  // esas consultas igualmente seria trabajo tirado para quien no esta en ninguno.
  for (const q of ['q_prayers', 'q_myPrayers', 'q_myPolls', 'q_myCommitments']) {
    assert.ok(cuerpo.includes(`hayGrupos ? ${q} :`), `${q} deberia ir tras hayGrupos`);
  }
  // Los reels NO: cualquiera publica uno sin estar en ningun grupo, y
  // condicionarlos dejaria sin avisos justo a quien todavia no se ha unido a nada.
  for (const q of ['q_myReels', 'q_reelsConMisComentarios']) {
    assert.ok(!cuerpo.includes(`hayGrupos ? ${q}`), `${q} no debe depender de tener grupos`);
  }
});

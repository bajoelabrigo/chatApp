// El anuncio de "o Socio $X+" que la app móvil pinta en el catálogo.
// (Importa de dist/, así que `npm test` compila primero.)
//
// La regla de verdad vive en holy_app (allí se paga y se descarga); esto es el
// TERCER espejo y solo sirve para anunciarla. Si se desincroniza, la app promete
// una membresía que la web no acepta — por eso los mínimos se comprueban aquí
// contra los mismos números que usa la web.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIO_MIN_BY_KIND, baseSocioMin, socioDealMin } from '../dist/lib/materialAccess.js';

test('los mínimos por tipo son los mismos que en la web', () => {
  assert.deepEqual(SOCIO_MIN_BY_KIND, { material: 10, libro: 50 });
});

test('sin mínimo propio manda el tipo y no hay nada que anunciar', () => {
  assert.equal(baseSocioMin({ kind: 'material' }), 10);
  assert.equal(baseSocioMin({ kind: 'libro' }), 50);
  assert.equal(socioDealMin({ kind: 'material' }), null);
  assert.equal(socioDealMin({ kind: 'libro' }), null);
  // Un material viejo no tiene ni `kind`: vale lo de siempre.
  assert.equal(socioDealMin({}), null);
});

test('el material de gancho devuelve su importe', () => {
  assert.equal(socioDealMin({ kind: 'material', socioMin: 5 }), 5);
  assert.equal(socioDealMin({ kind: 'libro', socioMin: 20 }), 20);
});

test('un mínimo MÁS alto que el de su tipo no se anuncia como oferta', () => {
  assert.equal(baseSocioMin({ kind: 'material', socioMin: 50 }), 50);
  assert.equal(socioDealMin({ kind: 'material', socioMin: 50 }), null);
  // Igual que su tipo tampoco es una oferta.
  assert.equal(socioDealMin({ kind: 'material', socioMin: 10 }), null);
  // Y $20 en un estudio, con el listón general en $10, es MÁS caro: tampoco.
  assert.equal(socioDealMin({ kind: 'material', socioMin: 20 }), null);
});

test('un socioMin corrupto no rompe el catálogo: se cae al de su tipo', () => {
  for (const malo of [null, undefined, 'gratis', NaN, -5]) {
    assert.equal(baseSocioMin({ kind: 'libro', socioMin: malo }), 50, String(malo));
    assert.equal(socioDealMin({ kind: 'libro', socioMin: malo }), null, String(malo));
  }
  // El cero SÍ es un valor: "cualquier socio se lo lleva".
  assert.equal(socioDealMin({ kind: 'material', socioMin: 0 }), 0);
});

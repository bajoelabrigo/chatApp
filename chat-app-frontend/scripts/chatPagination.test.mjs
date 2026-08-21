// El scroll infinito del chat pedía DOS veces la misma página: `onScroll` dispara
// cada 100 ms y el guardia leía el state `loadingMore`, que no se actualiza hasta
// el siguiente render. Se vio en el log del servidor: dos GET con el mismo
// `?before=`, separados por 157 ms.
//
// Es un test ESTRUCTURAL: no monta el componente (no hay renderer aquí), vigila
// que el guardia siga siendo un ref. Si alguien vuelve al state, esto falla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app/chat/[id].tsx'), 'utf8');

const loadMore = src.slice(src.indexOf('const loadMore = useCallback'));
const cuerpo = loadMore.slice(0, loadMore.indexOf('}, ['));

test('el guardia de "ya estoy cargando" es un ref, no el state', () => {
  assert.ok(cuerpo.includes('loadingMoreRef.current'), 'debe comprobar el ref');
  assert.equal(
    /\|\|\s*loadingMore\s*\|\|/.test(cuerpo),
    false,
    'no puede volver a comprobar el state `loadingMore`: su valor llega tarde a la clausura',
  );
});

test('el ref se marca ANTES del await y se limpia en finally', () => {
  const marca = cuerpo.indexOf('loadingMoreRef.current = true');
  const primerAwait = cuerpo.indexOf('await ');
  assert.ok(marca > -1, 'debe marcarse el ref');
  assert.ok(marca < primerAwait, 'marcar despues del await deja pasar el segundo disparo');
  assert.ok(cuerpo.includes('finally'), 'debe limpiarse siempre');
  const fin = cuerpo.indexOf('finally');
  assert.ok(cuerpo.indexOf('loadingMoreRef.current = false') > fin, 'la limpieza va en el finally');
});

test('una peticion cortada no deja una promesa sin manejar', () => {
  assert.ok(cuerpo.includes('catch'), 'loadMore necesita catch: salir del chat a media carga aborta el GET');
});

test('loadingMore sigue existiendo para pintar el indicador', () => {
  // El state no se elimina: es lo que muestra el ActivityIndicator del listado.
  assert.ok(src.includes('setLoadingMore(true)'));
  assert.ok(src.includes('loadingMore ?'), 'el spinner se pinta desde el state');
});

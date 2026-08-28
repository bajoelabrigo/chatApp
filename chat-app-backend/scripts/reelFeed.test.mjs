/**
 * Feed de reels: variedad de autores y proyección.
 *
 *     node scripts/reelFeed.test.mjs
 *
 * Dos cosas que se estropean en silencio:
 *  - Volver a `Reel.find().lean()` sin proyección: el feed vuelve a descargar
 *    los arreglos completos de `likes`, `views` y `comments` para usar solo sus
 *    recuentos. Con un reel de 5.000 vistas son ~250 KB por carga.
 *  - Quitar la penalización por autor: quien publica mucho se queda la portada
 *    otra vez (medido en producción, 4 de 5 reels eran de la misma persona).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const fuente = await readFile(new URL('../src/controllers/reelController.ts', import.meta.url), 'utf8');

test('el feed ordena por variedad de autores, no solo por fecha', () => {
  assert.match(fuente, /\$setWindowFields/, 'falta la etapa que numera los reels de cada autor');
  assert.match(fuente, /partitionBy: '\$authorId'/, 'la partición tiene que ser por autor');
  assert.match(fuente, /AUTHOR_DEMOTION_MS/, 'falta la penalización por reel repetido');
  assert.match(fuente, /feedScore: -1/, 'el orden debe usar la puntuación, no createdAt');
});

test('hay respaldo si Mongo no soporta $setWindowFields', () => {
  // Es de Mongo 5.0. Sin respaldo, un servidor viejo devolvería el feed VACÍO.
  const fn = fuente.slice(fuente.indexOf('async function reelFeedPage'));
  assert.match(fn.slice(0, 2000), /catch\s*{[\s\S]*?\$sort: \{ createdAt: -1/, 'falta el respaldo cronológico');
});

test('las listas no descargan likes/views/comments enteros', () => {
  assert.match(fuente, /likeCount: \{ \$size:/);
  assert.match(fuente, /viewCount: \{ \$size:/);
  assert.match(fuente, /commentCount: \{ \$size:/);
  // `liked` y `viewed` también se resuelven en la base, no en Node.
  assert.match(fuente, /liked: \{ \$in: \[viewer,/);
  assert.match(fuente, /viewed: \{ \$in: \[viewer,/);

  // Los tres endpoints de lista tienen que pasar por las etapas de proyección.
  for (const fn of ['getReelsFeed', 'getStories', 'getUserReels']) {
    const cuerpo = fuente.slice(fuente.indexOf(`export async function ${fn}`));
    const hasta = cuerpo.indexOf('\nexport async function', 1);
    const trozo = hasta > 0 ? cuerpo.slice(0, hasta) : cuerpo;
    assert.ok(
      trozo.includes('shapeStages') || trozo.includes('reelFeedPage'),
      `${fn} no proyecta: volvería a traer los documentos enteros`
    );
    assert.ok(
      !/Reel\.find\([^)]*\)[\s\S]{0,200}\.lean\(\)/.test(trozo),
      `${fn} volvió a un find().lean() sin proyección`
    );
  }
});

test('la penalización reordena de verdad (la fórmula, sin base de datos)', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  const h = (n) => ahora - n * 3600 * 1000;
  const reels = [
    { autor: 'Prolifico', at: h(1) }, { autor: 'Prolifico', at: h(2) },
    { autor: 'Prolifico', at: h(3) }, { autor: 'Prolifico', at: h(4) },
    { autor: 'Ana', at: h(5) }, { autor: 'Beto', at: h(6) },
  ];
  const rank = new Map();
  const puntuado = [...reels]
    .sort((a, b) => b.at - a.at)
    .map((r) => {
      const n = (rank.get(r.autor) ?? 0) + 1;
      rank.set(r.autor, n);
      return { ...r, score: r.at - (n - 1) * DIA };
    })
    .sort((a, b) => b.score - a.score);

  const primeros3 = new Set(puntuado.slice(0, 3).map((r) => r.autor));
  assert.equal(primeros3.size, 3, `los 3 primeros siguen siendo del mismo autor: ${[...primeros3]}`);
  assert.equal(puntuado[0].autor, 'Prolifico', 'el más reciente debe seguir el primero');
});

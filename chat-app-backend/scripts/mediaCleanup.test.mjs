/**
 * Recuento de referencias antes de borrar un archivo de Cloudinary:
 *
 *     npm run build && node scripts/mediaCleanup.test.mjs
 *
 * Lo que se prueba es el FILTRO, que es la parte que se equivoca en silencio:
 * si no encuentra al documento que sí usa el archivo, se borra un video que
 * está publicado y nadie se entera hasta que alguien abre el reel.
 *
 * La misma imagen se guarda con URLs distintas según quién la escribiera —con
 * versión, sin versión, con transformaciones, con el nombre en el fragmento—,
 * así que el filtro busca por `publicId`, que aparece literal en todas.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceFilters, escapeRegex } from '../dist/services/mediaCleanup.js';
import { publicIdFromUrl } from '../dist/services/cloudinaryService.js';

const PUBLIC_ID = 'chat-app/1787887777065_prueba.mp4';

// Las cinco formas en que esa MISMA subida aparece guardada por ahí.
const VARIANTES = {
  'url tal cual la devuelve /upload':
    'https://res.cloudinary.com/drojpkloa/video/upload/v1787887778/chat-app/1787887777065_prueba.mp4.mp4',
  'la que reproduce el cliente (f_mp4)':
    'https://res.cloudinary.com/drojpkloa/video/upload/f_mp4/v1787887778/chat-app/1787887777065_prueba.mp4.mp4',
  'la del muro, con el nombre en el fragmento':
    'https://res.cloudinary.com/drojpkloa/video/upload/v1787887778/chat-app/1787887777065_prueba.mp4.mp4#name=prueba.mp4',
  'sin prefijo de versión':
    'https://res.cloudinary.com/drojpkloa/video/upload/chat-app/1787887777065_prueba.mp4.mp4',
  'el póster del primer fotograma':
    'https://res.cloudinary.com/drojpkloa/video/upload/so_1,w_640/v1787887778/chat-app/1787887777065_prueba.mp4.jpg',
};

test('el publicId se deduce igual con y sin transformaciones', () => {
  for (const [caso, url] of Object.entries(VARIANTES)) {
    if (!url.includes('/v1')) continue; // el regex exige el prefijo de versión
    const got = publicIdFromUrl(url);
    assert.equal(got?.publicId, PUBLIC_ID, `${caso}: ${got?.publicId}`);
  }
});

test('el filtro encuentra el archivo escrito en CUALQUIERA de sus formas', () => {
  const { reels, posts } = referenceFilters(PUBLIC_ID);
  const reReel = new RegExp(reels.$or[1].videoUrl.$regex);
  const rePost = new RegExp(posts.image.$regex);

  for (const [caso, url] of Object.entries(VARIANTES)) {
    assert.ok(reReel.test(url), `reels no encontró la variante "${caso}"`);
    assert.ok(rePost.test(url), `posts no encontró la variante "${caso}"`);
  }
});

test('el filtro NO confunde un archivo con otro parecido', () => {
  const { posts } = referenceFilters(PUBLIC_ID);
  const rePost = new RegExp(posts.image.$regex);
  assert.ok(
    !rePost.test('https://res.cloudinary.com/drojpkloa/video/upload/v1/chat-app/otro_video.mp4.mp4'),
    'coincidió con un archivo distinto'
  );
});

test('el publicId sigue casando por el campo guardado al subir', () => {
  const { reels } = referenceFilters(PUBLIC_ID);
  assert.deepEqual(reels.$or[0], { cloudinaryPublicId: PUBLIC_ID });
});

test('los puntos del publicId se escapan (un .mp4 no puede casar cualquier carácter)', () => {
  // `chat-app/x.mp4` sin escapar casaría "x_mp4", "xAmp4"… y borraría de más.
  const re = new RegExp(escapeRegex('chat-app/x.mp4'));
  assert.ok(re.test('https://res.cloudinary.com/c/video/upload/v1/chat-app/x.mp4.mp4'));
  assert.ok(!re.test('https://res.cloudinary.com/c/video/upload/v1/chat-app/xXmp4.mp4'));
});

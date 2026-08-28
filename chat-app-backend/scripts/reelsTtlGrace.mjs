/**
 * Da margen al índice TTL de las historias:
 *
 *     node scripts/reelsTtlGrace.mjs
 *
 * Se ejecuta UNA vez (es idempotente: correrlo dos veces no hace nada nuevo).
 *
 * ── Por qué ──────────────────────────────────────────────────────────────────
 * `Reel.expiresAt` tenía un TTL con `expireAfterSeconds: 0`, o sea que Mongo
 * borraba el documento de la historia EN CUANTO vencía. El documento se iba con
 * el `cloudinaryPublicId` dentro y **el video se quedaba en Cloudinary para
 * siempre**: nadie podía limpiarlo después porque ya no quedaba rastro de cuál
 * era. Ese es el motivo real de este cambio.
 *
 * Ahora el borrado de verdad lo hace el barrido de `cronService` (cada 10 min:
 * borra el documento Y el video, respetando que el mismo archivo pueda estar
 * publicado también como reel o en el muro). Este TTL pasa a ser solo la red de
 * seguridad por si ese barrido no corriera durante días.
 *
 * Los usuarios no ven ninguna diferencia: las lecturas ya filtran por
 * `expiresAt > ahora`, así que una historia vencida es invisible desde el
 * segundo en que vence, siga o no su documento en la base.
 *
 * ── Por qué un script y no el esquema ────────────────────────────────────────
 * Mongoose crea índices que faltan, pero NUNCA cambia las opciones de uno que ya
 * existe: poner `expireAfterSeconds` en el esquema no habría tenido ningún
 * efecto sobre la base de producción, en silencio. Hace falta un `collMod`.
 *
 * Para revertirlo: mismo script con GRACE_SECONDS = 0.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

// 3 días de margen tras el vencimiento. Suficiente para sobrevivir a un fin de
// semana con el backend caído sin acumular historias vencidas en la base.
const GRACE_SECONDS = 3 * 24 * 60 * 60;
const INDEX_NAME = 'expiresAt_1';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI no está definido en .env');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const indexes = await db.collection('reels').indexes();
const ttl = indexes.find((i) => i.name === INDEX_NAME);

if (!ttl) {
  console.error(`El índice ${INDEX_NAME} no existe en "reels". Nada que hacer.`);
} else if (ttl.expireAfterSeconds === GRACE_SECONDS) {
  console.log(`Ya estaba aplicado (expireAfterSeconds = ${GRACE_SECONDS}). Sin cambios.`);
} else {
  console.log(`expireAfterSeconds: ${ttl.expireAfterSeconds} → ${GRACE_SECONDS}`);
  await db.command({
    collMod: 'reels',
    index: { name: INDEX_NAME, expireAfterSeconds: GRACE_SECONDS },
  });
  const after = (await db.collection('reels').indexes()).find((i) => i.name === INDEX_NAME);
  console.log('Hecho. Índice ahora:', JSON.stringify(after));
}

await mongoose.disconnect();

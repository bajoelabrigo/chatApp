/**
 * Pone `_id` a los comentarios de reels que no lo tienen:
 *
 *     node scripts/reelCommentIds.mjs
 *
 * Es idempotente: correrlo dos veces no cambia nada.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────────
 * `Reel.comments` se creó con `_id: false`. Al añadir "responder a un
 * comentario" hizo falta poder apuntar a UNO concreto (`arrayFilters` sobre
 * `comments._id`), así que el esquema pasa a llevar `_id`.
 *
 * Mongoose se lo pone a los comentarios NUEVOS, pero no toca los que ya
 * estaban: sin este script, los comentarios anteriores al cambio serían los
 * únicos del hilo sin botón de responder, y nadie entendería por qué.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI no está definido en .env');
  process.exit(1);
}

await mongoose.connect(uri);
const reels = mongoose.connection.db.collection('reels');

const conComentarios = await reels
  .find({ 'comments.0': { $exists: true } })
  .project({ comments: 1 })
  .toArray();

let tocados = 0;
let puestos = 0;

for (const reel of conComentarios) {
  const faltan = (reel.comments || []).some((c) => !c._id);
  if (!faltan) continue;
  const comments = reel.comments.map((c) => {
    if (c._id) return c;
    puestos++;
    return { ...c, _id: new mongoose.Types.ObjectId() };
  });
  await reels.updateOne({ _id: reel._id }, { $set: { comments } });
  tocados++;
}

console.log(
  conComentarios.length === 0
    ? 'No hay reels con comentarios. Nada que hacer.'
    : `Reels revisados: ${conComentarios.length} · con cambios: ${tocados} · comentarios con id nuevo: ${puestos}`
);

await mongoose.disconnect();

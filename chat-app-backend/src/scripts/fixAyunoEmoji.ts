/**
 * Corrige el emoji de las actividades de tipo "ayuno" que quedaron con un
 * valor corrupto (tofu □) tras una migración hecha pegando el emoji en una
 * terminal de Windows. Aquí el emoji se construye desde su code point
 * (U+1F932 🤲), así que viene del archivo .ts en UTF-8 — sin pegar nada en la
 * terminal, sin riesgo de corrupción.
 *
 * Matchea por `type: "ayuno"` (no por el emoji viejo), así repara cualquier
 * valor previo: 🍞, tofu, o lo que haya.
 *
 * Uso:
 *   cd chat-app-backend
 *   npx ts-node src/scripts/fixAyunoEmoji.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { GroupActivity } from '../models/GroupActivity';
import { PersonalCommitment } from '../models/PersonalCommitment';

const HANDS = String.fromCodePoint(0x1f932); // 🤲

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no está definido en .env');

  await mongoose.connect(uri);
  console.log('MongoDB conectado. Emoji destino:', HANDS, `(U+1F932)`);

  const g = await GroupActivity.updateMany(
    { type: 'ayuno' },
    { $set: { emoji: HANDS } }
  );
  const p = await PersonalCommitment.updateMany(
    { type: 'ayuno' },
    { $set: { emoji: HANDS } }
  );

  console.log(`groupactivities (ayuno): ${g.matchedCount} encontrados, ${g.modifiedCount} actualizados`);
  console.log(`personalcommitments (ayuno): ${p.matchedCount} encontrados, ${p.modifiedCount} actualizados`);

  // Verificación: lista los emojis resultantes
  const sample = await PersonalCommitment.find({ type: 'ayuno' })
    .select('name emoji')
    .lean();
  sample.forEach((s: any) => console.log(`  - ${s.name}: ${s.emoji}`));

  await mongoose.disconnect();
  console.log('Listo. ✅');
}

main().catch((err) => {
  console.error('Error en la migración:', err);
  process.exit(1);
});

import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { GroupDailyVerse } from '../models/GroupDailyVerse';
import { User } from '../models/User';
import { dailyVerseFor } from './bibleController';
import { localDateKey } from '../lib/dailyVerses';
import { getIO } from '../socket/ioSingleton';

// "Versículo del día" en el chat del grupo (tarjeta fija con reacciones
// compartidas). El versículo es determinista (mismo para todos ese día); aquí solo
// se guardan las reacciones por grupo + día.

function memberOf(groupId: string, userId: string) {
  return Conversation.findOne({ _id: groupId, isGroup: true, participants: userId }).lean();
}

// El día local del cliente (para que el versículo cambie a medianoche de SU zona).
function dateKeyFromReq(req: Request): string {
  const tz = (req.query.tz as string) || (req.body?.tz as string) || 'UTC';
  try {
    return localDateKey(new Date(), tz);
  } catch {
    return localDateKey(new Date(), 'UTC');
  }
}

// Reacciones pobladas (para pintar quién reaccionó) a partir del documento.
async function shapeReactions(doc: any) {
  const reactions = doc?.reactions ?? [];
  if (!reactions.length) return [];
  const ids = reactions.map((r: any) => r.user);
  const users = await User.find({ _id: { $in: ids } }).select('name avatar').lean();
  const byId = new Map(users.map((u: any) => [u._id.toString(), u]));
  return reactions.map((r: any) => {
    const u = byId.get(r.user.toString());
    return { userId: r.user.toString(), name: u?.name ?? 'Usuario', avatar: u?.avatar ?? null, emoji: r.emoji };
  });
}

// GET /conversations/:id/daily-verse?tz=&version=
export async function getGroupDailyVerse(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const groupId = req.params.id;
    const conv = await memberOf(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const dateKey = dateKeyFromReq(req);
    const version = typeof req.query.version === 'string' ? req.query.version : undefined;
    const verse = await dailyVerseFor(dateKey, version);
    if (!verse) return res.status(404).json({ error: 'Versículo no disponible' });

    const doc = await GroupDailyVerse.findOne({ groupId, dateKey }).lean();
    const reactions = await shapeReactions(doc);
    const myEmoji = reactions.find((r: any) => r.userId === userId)?.emoji ?? null;

    return res.json({ verse, dateKey, reactions, myEmoji });
  } catch (err) {
    console.error('getGroupDailyVerse:', err);
    return res.status(500).json({ error: 'Error al cargar el versículo del día' });
  }
}

// POST /conversations/:id/daily-verse/react  { emoji, tz }
export async function reactGroupDailyVerse(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const groupId = req.params.id;
    const conv = await memberOf(groupId, userId);
    if (!conv) return res.status(404).json({ error: 'Grupo no encontrado' });

    const emoji = String(req.body?.emoji ?? '').trim().slice(0, 8);
    if (!emoji) return res.status(400).json({ error: 'Emoji requerido' });

    const dateKey = dateKeyFromReq(req);

    const existing = await GroupDailyVerse.findOne({ groupId, dateKey });
    const current = existing?.reactions.find((r: any) => r.user.toString() === userId)?.emoji;

    if (current === emoji) {
      // Mismo emoji → se quita (toggle off).
      await GroupDailyVerse.updateOne({ groupId, dateKey }, { $pull: { reactions: { user: userId } } });
    } else {
      // Otro (o ninguno) → reemplaza: quitar el anterior y poner el nuevo.
      await GroupDailyVerse.updateOne(
        { groupId, dateKey },
        { $pull: { reactions: { user: userId } } },
        { upsert: true }
      );
      await GroupDailyVerse.updateOne(
        { groupId, dateKey },
        { $push: { reactions: { user: userId, emoji } } }
      );
    }

    const doc = await GroupDailyVerse.findOne({ groupId, dateKey }).lean();
    const reactions = await shapeReactions(doc);
    const myEmoji = reactions.find((r: any) => r.userId === userId)?.emoji ?? null;

    // Tiempo real a los demás miembros que tengan el chat abierto.
    const io = getIO();
    if (io) io.to(groupId).emit('daily-verse:react', { groupId, dateKey, reactions });

    return res.json({ reactions, myEmoji });
  } catch (err) {
    console.error('reactGroupDailyVerse:', err);
    return res.status(500).json({ error: 'Error al reaccionar' });
  }
}

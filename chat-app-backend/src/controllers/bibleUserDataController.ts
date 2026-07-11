import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { BibleUserData } from '../models/BibleUserData';

// Sincronización de datos personales de la Biblia (favoritos, resaltados, notas).
// La clave lógica de cada versículo es `id = "{book}:{chapter}:{verse}"`.

const MAX_ITEMS = 10000; // techo por tipo, evita abusos
const NOTE_MAX = 4000;

interface RawItem {
  id?: unknown;
  book?: unknown;
  chapter?: unknown;
  verse?: unknown;
  text?: unknown;
  color?: unknown;
  note?: unknown;
  updatedAt?: unknown;
}

const str = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max);

// Un item es válido si tiene id no vacío. Si falta, lo derivamos de book/chapter/verse.
function cleanId(raw: RawItem): string | null {
  let id = str(raw.id, 300).trim();
  if (!id) {
    const b = str(raw.book).trim();
    const c = str(raw.chapter).trim();
    const v = str(raw.verse).trim();
    if (b && c && v) id = `${b}:${c}:${v}`;
  }
  return id || null;
}

function toDate(v: unknown): Date {
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function normFavorite(raw: RawItem) {
  const id = cleanId(raw);
  if (!id) return null;
  return {
    id,
    book: str(raw.book),
    chapter: str(raw.chapter),
    verse: str(raw.verse),
    text: str(raw.text, 2000),
  };
}

function normHighlight(raw: RawItem) {
  const id = cleanId(raw);
  if (!id) return null;
  return {
    id,
    book: str(raw.book),
    chapter: str(raw.chapter),
    verse: str(raw.verse),
    color: str(raw.color, 32),
    updatedAt: toDate(raw.updatedAt),
  };
}

function normAnnotation(raw: RawItem) {
  const id = cleanId(raw);
  if (!id) return null;
  const note = str(raw.note, NOTE_MAX).trim();
  if (!note) return null;
  return {
    id,
    book: str(raw.book),
    chapter: str(raw.chapter),
    verse: str(raw.verse),
    note,
    updatedAt: toDate(raw.updatedAt),
  };
}

async function ensureDoc(user: string) {
  await BibleUserData.updateOne({ user }, { $setOnInsert: { user } }, { upsert: true });
}

function shape(doc: any) {
  return {
    favorites: doc?.favorites ?? [],
    highlights: doc?.highlights ?? [],
    annotations: doc?.annotations ?? [],
  };
}

// GET /bible/me/data — todo lo del usuario.
export async function getMyBibleData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const doc = await BibleUserData.findOne({ user: req.userId }).lean();
    res.json(shape(doc));
  } catch (err) {
    console.error('getMyBibleData:', err);
    res.status(500).json({ error: 'Error al cargar los datos de la Biblia' });
  }
}

// POST /bible/me/sync — fusiona un lote entrante con lo del servidor (usado para
// importar lo que había en localStorage/AsyncStorage al iniciar sesión, y como
// sincronización de respaldo). Union por id; resaltados/notas ganan por
// `updatedAt` más reciente. Nunca borra (los borrados van por sus DELETE).
export async function syncMyBibleData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const doc =
      (await BibleUserData.findOne({ user: req.userId })) ||
      new BibleUserData({ user: req.userId });

    // Favoritos: union por id (conserva el existente si ya está).
    const favMap = new Map(doc.favorites.map((f) => [f.id, f]));
    for (const raw of Array.isArray(body.favorites) ? body.favorites : []) {
      const f = normFavorite(raw);
      if (f && !favMap.has(f.id)) favMap.set(f.id, f as any);
    }

    // Resaltados: last-write-wins por updatedAt.
    const hlMap = new Map(doc.highlights.map((h) => [h.id, h]));
    for (const raw of Array.isArray(body.highlights) ? body.highlights : []) {
      const h = normHighlight(raw);
      if (!h) continue;
      const ex = hlMap.get(h.id);
      if (!ex || h.updatedAt.getTime() >= new Date(ex.updatedAt).getTime()) {
        hlMap.set(h.id, h as any);
      }
    }

    // Notas: last-write-wins por updatedAt.
    const anMap = new Map(doc.annotations.map((a) => [a.id, a]));
    for (const raw of Array.isArray(body.annotations) ? body.annotations : []) {
      const a = normAnnotation(raw);
      if (!a) continue;
      const ex = anMap.get(a.id);
      if (!ex || a.updatedAt.getTime() >= new Date(ex.updatedAt).getTime()) {
        anMap.set(a.id, a as any);
      }
    }

    doc.favorites = [...favMap.values()].slice(0, MAX_ITEMS) as any;
    doc.highlights = [...hlMap.values()].slice(0, MAX_ITEMS) as any;
    doc.annotations = [...anMap.values()].slice(0, MAX_ITEMS) as any;
    await doc.save();

    res.json(shape(doc));
  } catch (err) {
    console.error('syncMyBibleData:', err);
    res.status(500).json({ error: 'Error al sincronizar la Biblia' });
  }
}

// POST /bible/me/favorites — añade uno (sin duplicar por id).
export async function addFavorite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const fav = normFavorite(req.body || {});
    if (!fav) {
      res.status(400).json({ error: 'Favorito inválido' });
      return;
    }
    await ensureDoc(req.userId!);
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { favorites: { id: fav.id } } });
    await BibleUserData.updateOne({ user: req.userId }, { $push: { favorites: fav } });
    res.json({ ok: true });
  } catch (err) {
    console.error('addFavorite:', err);
    res.status(500).json({ error: 'Error al guardar el favorito' });
  }
}

// DELETE /bible/me/favorites/:id
export async function removeFavorite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id; // Express ya decodifica los params de ruta
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { favorites: { id } } });
    res.json({ ok: true });
  } catch (err) {
    console.error('removeFavorite:', err);
    res.status(500).json({ error: 'Error al quitar el favorito' });
  }
}

// PUT /bible/me/highlights — upsert de un resaltado por id.
export async function upsertHighlight(req: AuthRequest, res: Response): Promise<void> {
  try {
    const h = normHighlight(req.body || {});
    if (!h) {
      res.status(400).json({ error: 'Resaltado inválido' });
      return;
    }
    await ensureDoc(req.userId!);
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { highlights: { id: h.id } } });
    await BibleUserData.updateOne({ user: req.userId }, { $push: { highlights: h } });
    res.json({ ok: true });
  } catch (err) {
    console.error('upsertHighlight:', err);
    res.status(500).json({ error: 'Error al guardar el resaltado' });
  }
}

// DELETE /bible/me/highlights/:id
export async function removeHighlight(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id; // Express ya decodifica los params de ruta
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { highlights: { id } } });
    res.json({ ok: true });
  } catch (err) {
    console.error('removeHighlight:', err);
    res.status(500).json({ error: 'Error al quitar el resaltado' });
  }
}

// PUT /bible/me/annotations — upsert de una nota por id.
export async function upsertAnnotation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const a = normAnnotation(req.body || {});
    if (!a) {
      res.status(400).json({ error: 'Nota inválida' });
      return;
    }
    await ensureDoc(req.userId!);
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { annotations: { id: a.id } } });
    await BibleUserData.updateOne({ user: req.userId }, { $push: { annotations: a } });
    res.json({ ok: true });
  } catch (err) {
    console.error('upsertAnnotation:', err);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
}

// DELETE /bible/me/annotations/:id
export async function removeAnnotation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id; // Express ya decodifica los params de ruta
    await BibleUserData.updateOne({ user: req.userId }, { $pull: { annotations: { id } } });
    res.json({ ok: true });
  } catch (err) {
    console.error('removeAnnotation:', err);
    res.status(500).json({ error: 'Error al quitar la nota' });
  }
}

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
  tags?: unknown;
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

// Etiquetas del versículo: como mucho 6, de 24 caracteres, sin repetir.
const TAG_MAX = 24;
const TAGS_MAX = 6;

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const t of v) {
    const tag = str(t, TAG_MAX).trim();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
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
    tags: normTags(raw.tags),
    updatedAt: toDate(raw.updatedAt),
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
    // Los clientes también necesitan las lápidas: con ellas borran de su copia
    // local lo que se eliminó en otro dispositivo.
    deletions: doc?.deletions ?? [],
  };
}

// ── Lápidas (tombstones) ────────────────────────────────────────────────────
// Un borrado deja constancia con su fecha. En el merge, un item solo sobrevive
// si su `updatedAt` es POSTERIOR a la lápida; si no, se considera borrado. Así
// borrar en un dispositivo ya no "resucita" al sincronizar desde otro que aún
// tenía su copia.
const TOMB_TTL_DAYS = 180; // pasado ese tiempo la lápida ya no hace falta

function normDeletion(raw: any): BibleDeletion | null {
  const id = cleanId(raw);
  const kind = str(raw?.kind, 20);
  if (!id || !['favorite', 'highlight', 'annotation'].includes(kind)) return null;
  return { id, kind: kind as BibleItemKind, at: toDate(raw?.at) };
}

const tombKey = (kind: string, id: string) => `${kind}|${id}`;

/** Registra el borrado (o refresca su fecha si ya existía). */
async function recordDeletion(user: string, kind: BibleItemKind, id: string) {
  await BibleUserData.updateOne(
    { user },
    { $pull: { deletions: { id, kind } } }
  );
  await BibleUserData.updateOne(
    { user },
    { $push: { deletions: { id, kind, at: new Date() } } }
  );
}

interface BibleDeletion {
  id: string;
  kind: BibleItemKind;
  at: Date;
}
type BibleItemKind = 'favorite' | 'highlight' | 'annotation';

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
// `updatedAt` más reciente.
//
// Los BORRADOS viajan como lápidas (`deletions`), del cliente y del servidor: al
// final se descarta todo item cuya lápida sea igual o más reciente que su
// `updatedAt`. Antes esto era una unión pura y borrar en un dispositivo se
// deshacía en cuanto sincronizaba otro que aún tenía su copia.
export async function syncMyBibleData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const doc =
      (await BibleUserData.findOne({ user: req.userId })) ||
      new BibleUserData({ user: req.userId });

    // Lápidas: las del servidor + las que trae el cliente, quedándose con la más
    // reciente de cada (tipo, id).
    const tombs = new Map<string, BibleDeletion>();
    for (const d of doc.deletions ?? []) {
      tombs.set(tombKey(d.kind, d.id), { id: d.id, kind: d.kind, at: new Date(d.at) });
    }
    for (const raw of Array.isArray(body.deletions) ? body.deletions : []) {
      const d = normDeletion(raw);
      if (!d) continue;
      const ex = tombs.get(tombKey(d.kind, d.id));
      if (!ex || d.at.getTime() > ex.at.getTime()) tombs.set(tombKey(d.kind, d.id), d);
    }

    // ¿Este item está borrado? Sí, salvo que se haya vuelto a crear DESPUÉS.
    const isDeleted = (kind: BibleItemKind, id: string, updatedAt?: Date | string) => {
      const t = tombs.get(tombKey(kind, id));
      if (!t) return false;
      const when = updatedAt ? new Date(updatedAt).getTime() : 0;
      return when <= t.at.getTime();
    };

    // Favoritos: union por id. Si el favorito ya existe, se conserva pero se
    // UNEN las etiquetas (si no, etiquetar en un dispositivo y sincronizar
    // desde otro borraría las etiquetas nuevas).
    const favMap = new Map(doc.favorites.map((f) => [f.id, f]));
    for (const raw of Array.isArray(body.favorites) ? body.favorites : []) {
      const f = normFavorite(raw);
      if (!f) continue;
      const ex = favMap.get(f.id);
      if (!ex) {
        favMap.set(f.id, f as any);
        continue;
      }
      const merged = [...new Set([...(ex.tags ?? []), ...f.tags])].slice(0, TAGS_MAX);
      ex.tags = merged as any;
      // La fecha más reciente manda: es la que decide frente a una lápida.
      if (f.updatedAt.getTime() > new Date(ex.updatedAt ?? 0).getTime()) {
        ex.updatedAt = f.updatedAt as any;
      }
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

    // Se aplican las lápidas: fuera lo borrado (salvo que se recreara después).
    doc.favorites = [...favMap.values()]
      .filter((f) => !isDeleted('favorite', f.id, f.updatedAt))
      .slice(0, MAX_ITEMS) as any;
    doc.highlights = [...hlMap.values()]
      .filter((h) => !isDeleted('highlight', h.id, h.updatedAt))
      .slice(0, MAX_ITEMS) as any;
    doc.annotations = [...anMap.values()]
      .filter((a) => !isDeleted('annotation', a.id, a.updatedAt))
      .slice(0, MAX_ITEMS) as any;

    // Las lápidas caducan: pasado el TTL ya no queda ninguna copia por ahí con
    // el item vivo, y si no la lista crecería sin fin.
    const cutoff = Date.now() - TOMB_TTL_DAYS * 86_400_000;
    doc.deletions = [...tombs.values()]
      .filter((d) => d.at.getTime() >= cutoff)
      .slice(0, MAX_ITEMS) as any;

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
    await recordDeletion(req.userId!, 'favorite', id); // lápida: que no resucite al sincronizar
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
    await recordDeletion(req.userId!, 'highlight', id);
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
    await recordDeletion(req.userId!, 'annotation', id);
    res.json({ ok: true });
  } catch (err) {
    console.error('removeAnnotation:', err);
    res.status(500).json({ error: 'Error al quitar la nota' });
  }
}

import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { BibleUserData } from '../models/BibleUserData';
import { localDateKey } from '../lib/dailyVerses';

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
  group?: unknown;
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
    // Nota de pasaje: varios versículos comparten texto y `group`. Vacío = nota
    // suelta (todas las de antes de 2026-08-26).
    group: str(raw.group, 64),
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

// ═══════════════════════════════════════════════════════════════════════════
// Memorización (repaso espaciado)
// ═══════════════════════════════════════════════════════════════════════════
//
// Sistema de Leitner: cada versículo tiene un `level`. Acertar lo sube un escalón
// (y aleja el siguiente repaso); fallar lo devuelve al 0. Repasar algo que ya te
// sabes es tiempo perdido, y repasar demasiado tarde es volver a empezar: los
// intervalos crecen para repasar justo antes de olvidar.
//
// Días hasta el siguiente repaso según el escalón alcanzado.
const MEMORIZE_STEPS = [1, 3, 7, 16, 35];
const MEMORIZE_MAX = 200; // techo razonable: nadie memoriza 10.000 versículos

/**
 * Aprendido = ha SUPERADO el último escalón, no alcanzado.
 *
 * Con `>=` (el error original) el nivel 5 ya contaba como aprendido y el repaso
 * saltaba de 16 a 90 días: el escalón de 35 no se usaba nunca y el versículo se
 * daba por sabido un repaso antes de tiempo. El nivel N consume el escalón N-1,
 * así que hacen falta `MEMORIZE_STEPS.length + 1` aciertos para aprenderlo.
 */
function isLearned(level: number): boolean {
  return level > MEMORIZE_STEPS.length;
}

function nextDueAt(level: number): Date {
  // Aprendido: se aparca lejos (no desaparece, pero deja de pedir repaso a diario).
  const days = isLearned(level)
    ? 90
    : MEMORIZE_STEPS[Math.max(0, level - 1)] ?? 1;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function shapeMemorize(m: any) {
  return {
    id: m.id,
    book: m.book,
    chapter: m.chapter,
    verse: m.verse,
    text: m.text,
    level: m.level,
    dueAt: m.dueAt,
    reviews: m.reviews,
    isLearned: isLearned(m.level),
    isDue: new Date(m.dueAt).getTime() <= Date.now(),
  };
}

// GET /bible/me/memorize — los versículos que estoy memorizando. Primero los que
// tocan hoy: es lo único que el usuario necesita ver al abrir la pantalla.
export async function getMemorize(req: AuthRequest, res: Response): Promise<void> {
  try {
    const doc = await BibleUserData.findOne({ user: req.userId }).lean();
    const list = (doc?.memorize ?? []).map(shapeMemorize).sort((a, b) => {
      if (a.isDue !== b.isDue) return a.isDue ? -1 : 1; // pendientes primero
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
    res.json(list);
  } catch (err) {
    console.error('getMemorize:', err);
    res.status(500).json({ error: 'Error al cargar tus versículos' });
  }
}

// POST /bible/me/memorize — empezar a memorizar un versículo.
export async function addMemorize(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = cleanId(req.body ?? {});
    if (!id) {
      res.status(400).json({ error: 'Versículo inválido' });
      return;
    }
    const text = str(req.body?.text, 2000);
    if (!text) {
      res.status(400).json({ error: 'Falta el texto del versículo' });
      return;
    }

    await ensureDoc(req.userId!);

    const doc = await BibleUserData.findOne({ user: req.userId }).select('memorize').lean();
    const already = (doc?.memorize ?? []).some((m: any) => m.id === id);
    if (already) {
      // Volver a añadirlo no reinicia el progreso: sería un castigo absurdo por
      // pulsar dos veces.
      const current = (doc!.memorize as any[]).find((m) => m.id === id);
      res.json(shapeMemorize(current));
      return;
    }
    if ((doc?.memorize ?? []).length >= MEMORIZE_MAX) {
      res.status(400).json({ error: 'Has alcanzado el máximo de versículos a memorizar' });
      return;
    }

    const entry = {
      id,
      book: str(req.body?.book, 60),
      chapter: str(req.body?.chapter, 10),
      verse: str(req.body?.verse, 10),
      text,
      level: 0,
      dueAt: new Date(), // toca ya: se empieza a repasar hoy
      reviews: 0,
      addedAt: new Date(),
    };

    // El `$push` va CONDICIONADO a que el versículo siga sin estar.
    //
    // La comprobación de arriba (leer y luego escribir) no basta: dos toques
    // seguidos —o un reintento de la app— hacían que ambas peticiones leyeran "no
    // está" y ambas insertaran, dejando el versículo duplicado en la lista y
    // pidiéndolo repasar dos veces. Con el filtro dentro del propio update, el
    // segundo no encuentra documento que cumpla y no hace nada. Es el mismo patrón
    // que ya usáis para el progreso del seminario.
    const result = await BibleUserData.updateOne(
      { user: req.userId, 'memorize.id': { $ne: id } },
      { $push: { memorize: entry } }
    );

    // No se insertó porque otra petición se adelantó: se devuelve el que ya está,
    // no un error — para el usuario, el versículo quedó añadido igual.
    if (result.modifiedCount === 0) {
      const fresh = await BibleUserData.findOne({ user: req.userId }).select('memorize').lean();
      const current = (fresh?.memorize ?? []).find((m: any) => m.id === id);
      res.json(current ? shapeMemorize(current) : shapeMemorize(entry));
      return;
    }

    res.status(201).json(shapeMemorize(entry));
  } catch (err) {
    console.error('addMemorize:', err);
    res.status(500).json({ error: 'Error al añadir el versículo' });
  }
}

// POST /bible/me/memorize/:id/review — resultado de un repaso.
export async function reviewMemorize(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = decodeURIComponent(req.params.id);
    const correct = req.body?.correct === true;

    const doc = await BibleUserData.findOne({ user: req.userId }).select('memorize');
    const entry = (doc?.memorize ?? []).find((m: any) => m.id === id) as any;
    if (!entry) {
      res.status(404).json({ error: 'No estás memorizando ese versículo' });
      return;
    }

    // Acertar sube un escalón; fallar vuelve al principio (si no te sale, no lo
    // sabes: alargar el intervalo solo lo empeoraría).
    entry.level = correct ? entry.level + 1 : 0;
    entry.reviews = (entry.reviews ?? 0) + 1;
    entry.dueAt = nextDueAt(entry.level);
    await doc!.save();

    res.json(shapeMemorize(entry));
  } catch (err) {
    console.error('reviewMemorize:', err);
    res.status(500).json({ error: 'Error al guardar el repaso' });
  }
}

// DELETE /bible/me/memorize/:id — dejar de memorizarlo.
export async function removeMemorize(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = decodeURIComponent(req.params.id);
    await BibleUserData.updateOne(
      { user: req.userId },
      { $pull: { memorize: { id } } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('removeMemorize:', err);
    res.status(500).json({ error: 'Error al quitar el versículo' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Racha de lectura
// ═══════════════════════════════════════════════════════════════════════════

/** El día anterior a 'YYYY-MM-DD', en el mismo formato. */
function previousDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  // Date.UTC evita que el horario de verano desplace el día al restar 24h.
  const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
  return prev.toISOString().slice(0, 10);
}

// POST /bible/me/streak — "hoy he leído". Idempotente: leer diez capítulos en un
// día cuenta como UN día, y volver a llamar no altera nada.
//
// El día es el LOCAL del usuario (`tz`), no UTC: leer a las 23:30 en Lima debe
// contar como hoy, no como mañana.
export async function markReadToday(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tz = typeof req.body?.tz === 'string' && req.body.tz ? req.body.tz : 'UTC';
    let today: string;
    try {
      today = localDateKey(new Date(), tz);
    } catch {
      today = localDateKey(new Date(), 'UTC'); // zona horaria inválida del cliente
    }

    await ensureDoc(req.userId!);
    const doc = await BibleUserData.findOne({ user: req.userId }).select('streak');
    const streak: any = doc!.streak ?? {};

    if (streak.lastDay === today) {
      // Ya contaba hoy: no se toca nada (ni se rompe la racha ni se duplica).
      res.json(shapeStreak(streak));
      return;
    }

    const continues = streak.lastDay === previousDay(today);
    streak.current = continues ? (streak.current ?? 0) + 1 : 1;
    streak.longest = Math.max(streak.longest ?? 0, streak.current);
    streak.totalDays = (streak.totalDays ?? 0) + 1;
    streak.lastDay = today;

    doc!.streak = streak;
    await doc!.save();
    res.json(shapeStreak(streak));
  } catch (err) {
    console.error('markReadToday:', err);
    res.status(500).json({ error: 'Error al guardar la racha' });
  }
}

/**
 * La racha tal y como debe VERSE hoy. Ojo: el número guardado puede estar
 * caducado — si leíste 5 días seguidos y luego pasaste una semana sin abrir la
 * Biblia, en la base sigue poniendo 5. La racha solo sigue viva si el último día
 * leído fue hoy o ayer; si no, se muestra 0 (sin tocar la base: ya se corregirá
 * al volver a leer).
 */
function shapeStreak(streak: any, today?: string) {
  const last = streak?.lastDay ?? '';
  const alive = !today || last === today || last === previousDay(today);
  return {
    current: alive ? streak?.current ?? 0 : 0,
    longest: streak?.longest ?? 0,
    totalDays: streak?.totalDays ?? 0,
    lastDay: last,
    isTodayDone: !!today && last === today,
  };
}

// GET /bible/me/streak?tz=… — la racha para pintarla.
export async function getStreak(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tz = (req.query.tz as string) || 'UTC';
    let today: string;
    try {
      today = localDateKey(new Date(), tz);
    } catch {
      today = localDateKey(new Date(), 'UTC');
    }
    const doc = await BibleUserData.findOne({ user: req.userId }).select('streak').lean();
    res.json(shapeStreak(doc?.streak, today));
  } catch (err) {
    console.error('getStreak:', err);
    res.status(500).json({ error: 'Error al cargar la racha' });
  }
}

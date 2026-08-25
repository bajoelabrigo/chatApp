import { Request, Response } from 'express';
import path from 'path';
import { getDailyRef, localDateKey } from '../lib/dailyVerses';
import { BibleLang, namesFor } from '../lib/bibleNames';
import { fetchChapter as bibliaFetchChapter, searchBible as bibliaSearch, englishBookNames } from '../services/bibliaService';
import { TOPICS, TOPIC_CATEGORIES, getTopic } from '../lib/bibleTopics';

type BibleData = Record<string, Record<string, Record<string, string>>>;

// La RVR1960 se retiró (2026-07-11): su texto es propiedad de Sociedades
// Bíblicas Unidas (marca registrada, derechos administrados por la American
// Bible Society) y distribuir la Biblia completa —más aún permitir descargarla
// para uso sin conexión— excede con mucho el límite de cita libre (500
// versículos). Todas las versiones que quedan son de dominio público.
// NO volver a añadirla sin licencia por escrito.
const ALLOWED_VERSIONS = ['RV1909', 'RVA', 'SSE', 'RV1865', 'KJV', 'WEB', 'ASV', 'BBE', 'DARBY', 'YLT', 'ACV', 'ANDERSON', 'CPDV', 'DRC', 'GENEVA1599', 'HAWEIS', 'JPS', 'KJVPCE', 'NOYES', 'OEB', 'OEBUK', 'RNKJV', 'ROTHERHAM', 'RWEBSTER', 'TCNT', 'TYNDALE', 'UKJV', 'WEBSTER', 'MARTIN', 'SVV', 'ELBERFELDER', 'SYNODAL', 'ESPERANTO', 'VAMVAS', 'RVR60'] as const;
type VersionId = typeof ALLOWED_VERSIONS[number];

// Versión por defecto cuando el cliente no manda ninguna (o manda una retirada).
const DEFAULT_VERSION: VersionId = 'RV1909';

// Versiones "solo en línea": se sirven verso a verso desde api.biblia.com bajo la
// licencia de la plataforma (la key está en el servidor). NO tienen JSON local:
// `/bible/download` las rechaza (400) y el cliente no ofrece descarga offline.
// La RVR1960 tiene copyright de Sociedades Bíblicas Unidas: solo se puede
// DISTRIBUIR COMPLETA con licencia por escrito; en streaming es la vía legal.
const REMOTE_VERSIONS: Partial<Record<VersionId, { bibleId: string }>> = {
  RVR60: { bibleId: 'rvr60' },
};
const isRemote = (v: VersionId): boolean => v in REMOTE_VERSIONS;

const VERSION_META: Record<VersionId, { name: string; short: string; lang: BibleLang; remote?: boolean }> = {
  RV1909:  { name: 'Reina Valera 1909',          short: 'RV 1909',  lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada',   short: 'RVA',      lang: 'es' },
  SSE:     { name: 'Sagradas Escrituras 1569',   short: 'SSE 1569', lang: 'es' },
  RV1865:  { name: 'Reina Valera 1865',          short: 'RV 1865',  lang: 'es' },
  KJV:     { name: 'King James Version',         short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',        short: 'WEB',      lang: 'en' },
  ASV:     { name: 'American Standard Version',  short: 'ASV',      lang: 'en' },
  BBE:     { name: 'Bible in Basic English',     short: 'BBE',      lang: 'en' },
  DARBY:   { name: 'Darby Bible',                short: 'Darby',    lang: 'en' },
  YLT:     { name: "Young's Literal Translation", short: 'YLT',     lang: 'en' },
  // ── Lote 2026-08-21: dominio público desde scrollmapper/bible_databases ──
  ACV:      { name: 'A Conservative Version',            short: 'ACV',       lang: 'en' },
  ANDERSON: { name: 'Anderson New Testament 1864',       short: 'Anderson',  lang: 'en' },
  CPDV:     { name: 'Catholic Public Domain Version',    short: 'CPDV',      lang: 'en' },
  DRC:      { name: 'Douay-Rheims 1899 (Challoner)',     short: 'DRC',       lang: 'en' },
  GENEVA1599: { name: 'Geneva Bible 1599',               short: 'Geneva',    lang: 'en' },
  HAWEIS:   { name: 'Haweis New Testament 1795',         short: 'Haweis',    lang: 'en' },
  JPS:      { name: 'JPS 1917 (Antiguo Testamento)',     short: 'JPS',       lang: 'en' },
  KJVPCE:   { name: 'King James Version (Pure Cambridge)', short: 'KJV PCE', lang: 'en' },
  NOYES:    { name: 'Noyes Translation 1869',            short: 'Noyes',     lang: 'en' },
  OEB:      { name: 'Open English Bible',                short: 'OEB',       lang: 'en' },
  OEBUK:    { name: 'Open English Bible (UK)',           short: 'OEB (UK)',  lang: 'en' },
  RNKJV:    { name: 'Restored Name King James Version',  short: 'RNKJV',     lang: 'en' },
  ROTHERHAM: { name: 'Rotherham Emphasized Bible 1902',  short: 'Rotherham', lang: 'en' },
  RWEBSTER: { name: 'Revised Webster 1833',              short: 'Rev. Webster', lang: 'en' },
  TCNT:     { name: 'Twentieth Century New Testament 1904', short: 'TCNT',   lang: 'en' },
  TYNDALE:  { name: 'Tyndale Bible 1534',                short: 'Tyndale',   lang: 'en' },
  UKJV:     { name: 'Updated King James Version',        short: 'UKJV',      lang: 'en' },
  WEBSTER:  { name: "Webster's Bible 1833",              short: 'Webster',   lang: 'en' },
  // ── Lote 2026-08-21 (idiomas): dominio público desde scrollmapper ──
  MARTIN:     { name: 'Bible David Martin 1744',   short: 'Martin',     lang: 'fr' },
  SVV:        { name: 'Statenvertaling 1637',      short: 'SVV',        lang: 'nl' },
  ELBERFELDER: { name: 'Unrevidierte Elberfelder 1905', short: 'Elberfelder', lang: 'de' },
  SYNODAL:    { name: 'Ruso Sinodal 1876',         short: 'Sinodal',    lang: 'ru' },
  ESPERANTO:  { name: 'Londona Biblio (Esperanto)', short: 'Esperanto', lang: 'eo' },
  VAMVAS:     { name: 'Vamvas 1850 (Griego)',      short: 'Vamvas',     lang: 'el' },
  // ── Solo en línea (api.biblia.com, copyright SBU) ──
  RVR60:      { name: 'Reina Valera 1960',         short: 'RVR60',      lang: 'es', remote: true },
};

const lib = path.join(__dirname, '../lib/bible');

// Carga perezosa: cada versión ocupa ~10 MB de heap ya parseada. Cargarlas todas
// al arrancar serían decenas de MB de RAM que casi nadie usa, así que cada JSON
// se lee en su primer uso y se cachea. Además el arranque no paga el parseo.
const cache = new Map<VersionId, { data: BibleData; books: string[] }>();

function loadVersion(id: VersionId): { data: BibleData; books: string[] } {
  const hit = cache.get(id);
  if (hit) return hit;

  const data: BibleData = require(path.join(lib, `${id}.json`));
  // Filtra claves que no son libros (algunos payloads traen metadatos como 'lang').
  const books = Object.keys(data).filter((k) => typeof data[k] === 'object');
  const entry = { data, books };
  cache.set(id, entry);
  return entry;
}

// Una versión desconocida NO da error: cae a la por defecto. Es a propósito —
// las apps ya instaladas (APKs viejos que quizá nunca reciban el OTA) seguirán
// pidiendo `version=RVR1960` para siempre. Devolverles 400 les rompería la
// Biblia entera; devolverles la RV1909 (dominio público, lenguaje casi idéntico)
// les deja una app que funciona y, sobre todo, deja de servir texto con
// copyright, que es el objetivo.
function getVersionData(req: Request): { data: BibleData; books: string[] } | null {
  const raw = ((req.query.version as string) ?? DEFAULT_VERSION).toUpperCase();
  const v = (ALLOWED_VERSIONS as readonly string[]).includes(raw)
    ? (raw as VersionId)
    : DEFAULT_VERSION;
  // Las remotas no tienen JSON local: quien llegue aquí (sin rama remota) debe
  // degradar a null en vez de intentar `require` de un archivo inexistente.
  if (isRemote(v)) return null;
  return loadVersion(v);
}

// El id de la versión pedida, ya saneado (misma regla que getVersionData).
function resolveVersionId(req: Request): VersionId {
  const raw = ((req.query.version as string) ?? DEFAULT_VERSION).toUpperCase();
  return (ALLOWED_VERSIONS as readonly string[]).includes(raw)
    ? (raw as VersionId)
    : DEFAULT_VERSION;
}

export function getVersions(_req: Request, res: Response) {
  res.json(ALLOWED_VERSIONS.map((id) => ({ id, ...VERSION_META[id] })));
}

/**
 * Versículo del día (#8) — público.
 *
 * El mismo para todos los usuarios el mismo día (se deriva de la fecha, no al
 * azar), así se puede compartir y comentar en comunidad. `tz` decide de qué día
 * hablamos: en Madrid y en Lima el día no cambia a la vez.
 */
export interface DailyVerse {
  date: string;
  version: string;
  versionName: string;
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

/** El versículo de ese día en esa versión. Lo usan el endpoint y el cron del push. */
export function dailyVerseFor(dateKey: string, version: string = DEFAULT_VERSION): DailyVerse | null {
  const versionId = (ALLOWED_VERSIONS as readonly string[]).includes(version)
    ? (version as VersionId)
    : DEFAULT_VERSION;
  // Las versiones solo-en-línea no tienen daily (evita llamadas extra a la API):
  // la tarjeta se oculta en el cliente (captura el 404).
  if (isRemote(versionId)) return null;
  const { data } = loadVersion(versionId);

  const ref = getDailyRef(dateKey);
  const names = namesFor(VERSION_META[versionId].lang);
  const book = names[ref.book];
  const text = data[book]?.[String(ref.chapter)]?.[String(ref.verse)];
  if (!text) return null;

  return {
    date: dateKey,
    version: versionId,
    versionName: VERSION_META[versionId].name,
    book,
    chapter: String(ref.chapter),
    verse: String(ref.verse),
    text: text.trim(),
  };
}

export function getDailyVerse(req: Request, res: Response) {
  const tz = (req.query.tz as string) || 'UTC';
  let dateKey: string;
  try {
    dateKey = localDateKey(new Date(), tz);
  } catch {
    dateKey = localDateKey(new Date(), 'UTC'); // zona horaria inválida del cliente
  }

  const verse = dailyVerseFor(dateKey, resolveVersionId(req));
  if (!verse) {
    // No debería pasar (los pasajes del versículo del día están verificados
    // contra las versiones), pero si una versión tuviera un hueco —p.ej. la
    // RV1865 o el Darby omiten algunos versículos que otras ediciones sí traen—,
    // mejor un 404 claro que un crash.
    res.status(404).json({ error: 'Versículo no disponible en esta versión' });
    return;
  }
  res.json(verse);
}

export function getBooks(req: Request, res: Response) {
  const version = resolveVersionId(req);
  // Remotas: la Biblia es completa, así que la lista de libros es el orden
  // canónico del idioma (sin llamada a la API).
  if (isRemote(version)) {
    res.json(namesFor(VERSION_META[version].lang));
    return;
  }
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  res.json(vd.books);
}

// Estructura de capítulos de referencia (RV1909, Biblia completa) para servir
// la lista de capítulos de las versiones remotas sin llamar a la API.
let remoteChapterMap: Record<string, string[]> | null = null;
function remoteChapters(): Record<string, string[]> {
  if (!remoteChapterMap) {
    const { data } = loadVersion('RV1909');
    remoteChapterMap = Object.fromEntries(
      Object.entries(data).map(([book, chs]) => [book, Object.keys(chs)])
    );
  }
  return remoteChapterMap;
}

export function getChapters(req: Request, res: Response) {
  const version = resolveVersionId(req);
  const book = decodeURIComponent(req.params.book);
  if (isRemote(version)) {
    const chs = remoteChapters()[book];
    if (!chs) { res.status(404).json({ error: 'Libro no encontrado' }); return; }
    res.json(chs);
    return;
  }
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const bookData = vd.data[book];
  if (!bookData) { res.status(404).json({ error: 'Libro no encontrado' }); return; }
  res.json(Object.keys(bookData));
}

export async function getVerses(req: Request, res: Response) {
  const version = resolveVersionId(req);
  const book = decodeURIComponent(req.params.book);
  const { chapter } = req.params;

  // Rama remota: se pide el capítulo a api.biblia.com con el nombre de libro en
  // inglés (la API referencia así todos los idiomas), mapeado por índice canónico.
  if (isRemote(version)) {
    try {
      const esNames = namesFor(VERSION_META[version].lang);
      const idx = esNames.indexOf(book);
      if (idx < 0) { res.status(404).json({ error: 'Libro no encontrado' }); return; }
      const bookEn = englishBookNames()[idx];
      const verses = await bibliaFetchChapter(REMOTE_VERSIONS[version]!.bibleId, bookEn, chapter);
      res.json(verses);
    } catch (err: any) {
      res.status(502).json({ error: err?.message === 'BIBLIA_API_KEY no configurada' ? err.message : 'No se pudo obtener la versión en línea' });
    }
    return;
  }

  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const chapterData = vd.data[book]?.[chapter];
  if (!chapterData) { res.status(404).json({ error: 'Capítulo no encontrado' }); return; }
  res.json(Object.entries(chapterData).map(([verse, text]) => ({ verse, text: text.trim() })));
}

// Búsqueda insensible a mayúsculas Y a tildes: en español, buscar "corazon" y no
// encontrar "corazón" es inaceptable. `fold` quita las tildes conservando la
// LONGITUD del texto (cada acentuada precompuesta → su letra base), para que la
// posición de la coincidencia siga valiendo sobre el texto original y los
// clientes puedan resaltar el término.
const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function searchVerses(req: Request, res: Response) {
  const version = resolveVersionId(req);
  const raw = (req.query.q as string | undefined)?.trim();
  if (!raw || raw.length < 3) {
    res.status(400).json({ error: 'La búsqueda debe tener al menos 3 caracteres' });
    return;
  }
  const q = fold(raw);

  const testament = req.query.testament as 'ot' | 'nt' | undefined;
  const bookFilter = (req.query.book as string | undefined)?.trim();
  const paged = req.query.paged === '1';
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit ?? (paged ? '50' : '100')), 10) || 50)
  );

  // Rama remota: la búsqueda la hace api.biblia.com (la local escanearía 31.000
  // versos de un JSON que no existe). Se traen hasta 1.000 y se filtran/pagean
  // aquí con las mismas reglas que la búsqueda local.
  if (isRemote(version)) {
    try {
      const names = namesFor(VERSION_META[version].lang);
      const enNames = englishBookNames();
      const hits = await bibliaSearch(REMOTE_VERSIONS[version]!.bibleId, raw);
      const inScopeRemote = (bookEs: string): boolean => {
        if (bookFilter && bookEs !== bookFilter) return false;
        if (testament !== 'ot' && testament !== 'nt') return true;
        const i = names.indexOf(bookEs);
        if (i < 0) return true;
        return testament === 'ot' ? i < 39 : i >= 39;
      };
      const results: { book: string; chapter: string; verse: string; text: string }[] = [];
      let total = 0;
      for (const hit of hits) {
        const bookEs = names[enNames.indexOf(hit.bookEn)] ?? hit.bookEn;
        if (!inScopeRemote(bookEs)) continue;
        total++;
        if (total > offset && results.length < limit) {
          results.push({ book: bookEs, chapter: hit.chapter, verse: hit.verse, text: hit.text });
        }
      }
      res.json(paged ? { results, total, offset } : results);
    } catch (err: any) {
      res.status(502).json({ error: err?.message === 'BIBLIA_API_KEY no configurada' ? err.message : 'No se pudo buscar en la versión en línea' });
    }
    return;
  }

  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const names = namesFor(VERSION_META[version].lang);

  const inScope = (book: string): boolean => {
    if (bookFilter && book !== bookFilter) return false;
    if (testament !== 'ot' && testament !== 'nt') return true;
    const i = names.indexOf(book);
    if (i < 0) return true; // libro que no reconocemos: no lo escondemos
    return testament === 'ot' ? i < 39 : i >= 39; // Mateo (39) abre el Nuevo
  };

  // ORDEN CANÓNICO. Los libros salen de `Object.keys` del JSON, cuyo orden no es
  // el bíblico en todas las versiones (buscar "heart" en KJV empezaba por
  // 1 Corintios). Se recorren en orden canónico y los desconocidos, al final.
  const ordered = [
    ...names.filter((b) => vd.data[b]),
    ...vd.books.filter((b) => !names.includes(b)),
  ];

  const results: { book: string; chapter: string; verse: string; text: string }[] = [];
  let total = 0;

  for (const book of ordered) {
    if (!inScope(book)) continue;
    const bookData = vd.data[book];
    for (const chapter of Object.keys(bookData)) {
      const chapterData = bookData[chapter];
      for (const verse of Object.keys(chapterData)) {
        const text = chapterData[verse];
        if (!fold(text).includes(q)) continue;
        total++;
        if (total > offset && results.length < limit) {
          results.push({ book, chapter, verse, text: text.trim() });
        }
      }
    }
  }

  // Compatibilidad: los clientes viejos (APKs sin OTA) esperan un ARRAY pelado.
  // Solo quien pida `paged=1` recibe el objeto con el total y la paginación.
  if (paged) {
    res.json({ results, total, offset, limit });
    return;
  }
  res.json(results);
}

// ─────────────────────────────────────────────────────────────────────────────
// Referencias cruzadas
//
// Dataset de openbible.info (CC-BY), derivado del Treasury of Scripture
// Knowledge. Son solo PUNTEROS (Juan 3:16 → Romanos 5:8), no texto bíblico, así
// que no arrastran las restricciones de copyright de una traducción: el texto que
// se muestra sale siempre de nuestras versiones de dominio público.
//
// El JSON está indexado por ÍNDICE de libro (0–65, orden canónico), no por
// nombre, para ser agnóstico de versión — igual que los planes de lectura. La
// clave es "libro.capítulo.versículo" y el valor, los destinos ordenados de más
// a menos respaldados: [libro, capítulo, versículo] o [libro, capítulo, desde,
// hasta] cuando el destino es un tramo.
// La licencia CC-BY obliga a atribuir: los clientes muestran `source`.
type XrefTarget = [number, number, number] | [number, number, number, number];
type XrefData = Record<string, XrefTarget[]>;

export const XREF_SOURCE = 'openbible.info (CC BY)';

// Misma carga perezosa que las versiones: ~2,6 MB que solo pagan quienes usan la
// función.
let xrefCache: XrefData | null = null;
function loadXrefs(): XrefData {
  if (!xrefCache) xrefCache = require(path.join(lib, 'XREFS.json')) as XrefData;
  return xrefCache;
}

/**
 * Los nombres de libro de las 7 versiones coinciden EXACTAMENTE con las listas
 * canónicas (verificado: 66/66 en cada versión), así que la posición en la lista
 * del idioma es el índice canónico. Si algún día una versión nueva nombrara los
 * libros de otra forma, esto devuelve -1 y la función se degrada a "sin
 * referencias" en vez de apuntar al libro equivocado.
 */
function bookNames(version: VersionId): string[] {
  return namesFor(VERSION_META[version].lang);
}

export interface XrefResult {
  book: string;
  chapter: string;
  verse: string;
  endVerse?: string;
  text: string;
}

/** Los destinos de un versículo, ya resueltos a nombre y texto de `version`. */
function resolveTargets(
  targets: XrefTarget[],
  version: VersionId,
  data: BibleData
): XrefResult[] {
  const names = bookNames(version);
  const out: XrefResult[] = [];

  for (const t of targets) {
    const [bookIdx, chapter, from, to] = t;
    const book = names[bookIdx];
    if (!book) continue;

    const chapterData = data[book]?.[String(chapter)];
    if (!chapterData) continue;

    // Un tramo (Ps.148.4-5) se muestra como un solo bloque de texto. Si alguno de
    // los versículos del tramo no existe en esta versión, se usa lo que haya.
    const last = to && to > from ? to : from;
    const parts: string[] = [];
    for (let v = from; v <= last; v++) {
      const text = chapterData[String(v)];
      if (text) parts.push(text.trim());
    }
    if (!parts.length) continue;

    out.push({
      book,
      chapter: String(chapter),
      verse: String(from),
      ...(last > from ? { endVerse: String(last) } : {}),
      text: parts.join(' '),
    });
  }

  return out;
}

/**
 * Cuántas referencias cruzadas tiene cada versículo del capítulo:
 * `{ "1": 4, "16": 10 }`. Solo números — el cliente lo pide al abrir el capítulo
 * para pintar el indicador junto a cada versículo, así que tiene que ser
 * diminuto. Los versículos sin referencias no aparecen.
 */
export function getChapterXrefCounts(req: Request, res: Response) {
  const version = resolveVersionId(req);
  // Remotas: el recuento necesita el texto local (no se pide a la API); el
  // cliente degrada en silencio a "sin referencias".
  if (isRemote(version)) { res.json({}); return; }
  const names = bookNames(version);
  const book = decodeURIComponent(req.params.book);
  const bookIdx = names.indexOf(book);
  if (bookIdx < 0) { res.json({}); return; }

  const chapter = parseInt(req.params.chapter, 10);
  if (!Number.isFinite(chapter)) { res.json({}); return; }

  const xrefs = loadXrefs();
  const counts: Record<string, number> = {};
  const prefix = `${bookIdx}.${chapter}.`;

  // Se recorren los versículos del capítulo (no las 29.000 claves del dataset):
  // el capítulo más largo es Salmos 119 con 176.
  const { data } = loadVersion(version);
  const chapterData = data[book]?.[String(chapter)];
  if (!chapterData) { res.json({}); return; }

  for (const verse of Object.keys(chapterData)) {
    const hit = xrefs[prefix + verse];
    if (hit?.length) counts[verse] = hit.length;
  }

  res.json(counts);
}

/**
 * Las referencias cruzadas de UN versículo, con el texto de cada pasaje ya
 * resuelto en la versión activa. Una sola petición pinta el panel entero: sin
 * esto el cliente tendría que pedir 10 versículos sueltos.
 */
export function getVerseXrefs(req: Request, res: Response) {
  const version = resolveVersionId(req);
  // Remotas: sin texto local no se pueden resolver los pasajes destino.
  if (isRemote(version)) {
    res.status(404).json({ error: 'Referencias no disponibles en esta versión' });
    return;
  }
  const { data } = loadVersion(version);
  const names = bookNames(version);

  const book = decodeURIComponent(req.params.book);
  const bookIdx = names.indexOf(book);
  const chapter = parseInt(req.params.chapter, 10);
  const verse = parseInt(req.params.verse, 10);

  if (bookIdx < 0 || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    res.status(404).json({ error: 'Referencia no válida' });
    return;
  }

  const targets = loadXrefs()[`${bookIdx}.${chapter}.${verse}`] ?? [];
  res.json({
    book,
    chapter: String(chapter),
    verse: String(verse),
    version,
    source: XREF_SOURCE,
    results: resolveTargets(targets, version, data),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Temas: pasajes para un momento concreto (boda, cumpleaños, visita, duelo…).
//
// Resuelve el catálogo de `lib/bibleTopics.ts` (referencias por índice de libro,
// agnósticas de versión) al nombre y al texto de la versión que pida el cliente.
//
// Cada pasaje se devuelve VERSÍCULO A VERSÍCULO, aunque sea un rango (Salmos
// 23:1-6): así cada versículo conserva su clave `libro:capítulo:versículo` y con
// ella TODO lo que ya existe —favorito, resaltado, nota, etiquetas, compartir,
// referencias cruzadas, memorizar, pedir oración—. Devolver el rango como un
// bloque de texto habría dejado esas acciones sin a qué agarrarse.

export interface TopicPassage {
  book: string;
  chapter: string;
  from: string;
  to?: string;
  /** "Salmos 23:1-6" — la referencia tal y como se muestra. */
  label: string;
  verses: { verse: string; text: string }[];
}

// GET /bible/topics — el catálogo (sin texto: solo los temas y cuántos pasajes).
export function getTopics(_req: Request, res: Response) {
  res.json({
    categories: TOPIC_CATEGORIES,
    topics: TOPICS.map((t) => ({
      key: t.key,
      title: t.title,
      description: t.description,
      category: t.category,
      emoji: t.emoji,
      count: t.refs.length,
    })),
  });
}

// GET /bible/topics/:key?version=… — los pasajes del tema, con su texto.
export function getTopicDetail(req: Request, res: Response) {
  const topic = getTopic(req.params.key);
  if (!topic) {
    res.status(404).json({ error: 'Tema no encontrado' });
    return;
  }

  const version = resolveVersionId(req);
  // Remotas: los temas resuelven el texto desde el JSON local.
  if (isRemote(version)) {
    res.status(404).json({ error: 'Temas no disponibles en esta versión' });
    return;
  }
  const { data } = loadVersion(version);
  const names = bookNames(version);

  const passages: TopicPassage[] = [];

  for (const ref of topic.refs) {
    const [bookIdx, chapter, from, to] = ref;
    const book = names[bookIdx];
    if (!book) continue;

    const chapterData = data[book]?.[String(chapter)];
    if (!chapterData) continue;

    const last = to && to > from ? to : from;
    const verses: { verse: string; text: string }[] = [];
    for (let v = from; v <= last; v++) {
      const text = chapterData[String(v)];
      if (text) verses.push({ verse: String(v), text: text.trim() });
    }
    // Un pasaje que no existe en esta versión se omite en vez de salir vacío.
    if (!verses.length) continue;

    const realLast = verses[verses.length - 1].verse;
    passages.push({
      book,
      chapter: String(chapter),
      from: String(from),
      ...(realLast !== String(from) ? { to: realLast } : {}),
      label: `${book} ${chapter}:${from}${realLast !== String(from) ? `-${realLast}` : ''}`,
      verses,
    });
  }

  res.json({
    key: topic.key,
    title: topic.title,
    description: topic.description,
    category: topic.category,
    emoji: topic.emoji,
    version,
    passages,
  });
}

export function downloadBible(req: Request, res: Response) {
  const version = resolveVersionId(req);
  // Las versiones solo-en-línea NO se pueden descargar: sería distribuir el
  // texto completo con copyright (RVR60 © Sociedades Bíblicas Unidas). El
  // cliente tampoco ofrece el botón de descarga para ellas.
  if (isRemote(version)) {
    res.status(400).json({ error: 'Esta versión solo está disponible en línea' });
    return;
  }
  const vd = getVersionData(req);
  if (!vd) { res.status(400).json({ error: 'Versión no válida' }); return; }
  const payload: BibleData = {};
  for (const key of vd.books) payload[key] = vd.data[key];
  res.json(payload);
}

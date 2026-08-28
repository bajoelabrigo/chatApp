import { Request, Response } from 'express';
import path from 'path';
import { getDailyRef, localDateKey } from '../lib/dailyVerses';
import { BibleLang, namesFor } from '../lib/bibleNames';
import { fetchChapter as bibliaFetchChapter, searchBible as bibliaSearch, englishBookNames } from '../services/bibliaService';
import { TOPICS, TOPIC_CATEGORIES, getTopic, topicOfDay, type Topic } from '../lib/bibleTopics';

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

/**
 * Texto de un pasaje referenciado por ÍNDICE canónico de libro (0–65), en la
 * versión pedida. Es el puente entre los catálogos agnósticos de versión
 * (versículo del día, temas) y el texto real:
 *  · versión local  → del JSON ya cacheado.
 *  · versión remota → del capítulo de api.biblia.com (cacheado 6 h; el nombre
 *    de libro va en inglés, que es como la API referencia todos los idiomas).
 *
 * Devuelve `null` si el pasaje no existe en esa versión (las biblias históricas
 * son parciales: JPS solo AT, TCNT solo NT…) o si la API falla. Quien llama
 * decide si degradar a la versión por defecto.
 */
async function passageIn(
  version: VersionId,
  bookIdx: number,
  chapter: number,
  from: number,
  to?: number
): Promise<{ book: string; verses: { verse: string; text: string }[] } | null> {
  const names = namesFor(VERSION_META[version].lang);
  const book = names[bookIdx];
  if (!book) return null;
  const last = to && to > from ? to : from;

  let chapterData: Record<string, string> | undefined;
  if (isRemote(version)) {
    try {
      const bookEn = englishBookNames()[bookIdx];
      const rows = await bibliaFetchChapter(REMOTE_VERSIONS[version]!.bibleId, bookEn, String(chapter));
      chapterData = Object.fromEntries(rows.map((r) => [r.verse, r.text]));
    } catch {
      return null; // API caída o sin key: quien llama degrada a la por defecto
    }
  } else {
    chapterData = loadVersion(version).data[book]?.[String(chapter)];
  }
  if (!chapterData) return null;

  const verses: { verse: string; text: string }[] = [];
  for (let v = from; v <= last; v++) {
    const text = chapterData[String(v)];
    if (text) verses.push({ verse: String(v), text: text.trim() });
  }
  return verses.length ? { book, verses } : null;
}

/**
 * El versículo de ese día en esa versión. Lo usan el endpoint y el cron del push.
 *
 * **Nunca devuelve null salvo catástrofe**: si la versión pedida no tiene ese
 * pasaje (biblia parcial) o es remota y la API falla, cae a la versión por
 * defecto y lo dice en `version`/`versionName`. Antes devolvía null y el cliente
 * escondía la tarjeta: con la RVR60 (solo en línea) el versículo del día
 * desapareció de la web y de la app para todo el que la tuviera elegida.
 */
export async function dailyVerseFor(
  dateKey: string,
  version: string = DEFAULT_VERSION
): Promise<DailyVerse | null> {
  const requested = (ALLOWED_VERSIONS as readonly string[]).includes(String(version).toUpperCase())
    ? (String(version).toUpperCase() as VersionId)
    : DEFAULT_VERSION;

  const ref = getDailyRef(dateKey);

  for (const v of requested === DEFAULT_VERSION ? [requested] : [requested, DEFAULT_VERSION]) {
    const p = await passageIn(v, ref.book, ref.chapter, ref.verse);
    if (!p) continue;
    return {
      date: dateKey,
      version: v,
      versionName: VERSION_META[v].name,
      book: p.book,
      chapter: String(ref.chapter),
      verse: String(ref.verse),
      text: p.verses[0].text,
    };
  }
  return null;
}

export async function getDailyVerse(req: Request, res: Response) {
  const tz = (req.query.tz as string) || 'UTC';
  let dateKey: string;
  try {
    dateKey = localDateKey(new Date(), tz);
  } catch {
    dateKey = localDateKey(new Date(), 'UTC'); // zona horaria inválida del cliente
  }

  const verse = await dailyVerseFor(dateKey, resolveVersionId(req));
  if (!verse) {
    // No debería pasar: los pasajes del versículo del día están verificados
    // contra la versión por defecto, que es el último respaldo.
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
async function resolveTargets(
  targets: XrefTarget[],
  version: VersionId
): Promise<XrefResult[]> {
  // Los pasajes destino se resuelven EN PARALELO: en una versión remota cada uno
  // es una petición a api.biblia.com (cacheada 6 h), y un versículo puede tener
  // diez. En secuencia, abrir el panel serían diez idas y vueltas.
  const resolved = await Promise.all(
    targets.map(async (t) => {
      const [bookIdx, chapter, from, to] = t;
      // Un tramo (Ps.148.4-5) se muestra como un solo bloque de texto. Si algún
      // versículo del tramo no existe en esta versión, se usa lo que haya.
      let p = await passageIn(version, bookIdx, chapter, from, to);
      // Si la versión pedida no lo tiene (biblia parcial) o la API remota falló,
      // se enseña el pasaje en la versión por defecto: el panel de referencias
      // medio vacío es peor que un pasaje en RV1909.
      if (!p && version !== DEFAULT_VERSION) p = await passageIn(DEFAULT_VERSION, bookIdx, chapter, from, to);
      if (!p) return null;

      const last = to && to > from ? to : from;
      const result: XrefResult = {
        book: p.book,
        chapter: String(chapter),
        verse: String(from),
        ...(last > from ? { endVerse: String(last) } : {}),
        text: p.verses.map((v) => v.text).join(' '),
      };
      return result;
    })
  );

  return resolved.filter((r): r is XrefResult => r !== null);
}

/**
 * Índice `bookIdx.chapter` → `{ versículo: nº de referencias }`, construido una
 * sola vez a partir del dataset de referencias cruzadas.
 *
 * Existe por las versiones REMOTAS: el recuento se sacaba recorriendo los
 * versículos del capítulo en el JSON local, y una versión sin JSON (RVR60) se
 * quedaba sin indicadores de referencias — que es justo lo que el usuario
 * notaba. Con el índice, el recuento no depende del texto.
 */
let xrefCountsIndex: Record<string, Record<string, number>> | null = null;
function loadXrefCounts(): Record<string, Record<string, number>> {
  if (xrefCountsIndex) return xrefCountsIndex;
  const idx: Record<string, Record<string, number>> = {};
  for (const [key, targets] of Object.entries(loadXrefs())) {
    const cut = key.lastIndexOf('.');
    const chapterKey = key.slice(0, cut);
    const verse = key.slice(cut + 1);
    if (!targets?.length) continue;
    (idx[chapterKey] ??= {})[verse] = targets.length;
  }
  xrefCountsIndex = idx;
  return idx;
}

/**
 * Cuántas referencias cruzadas tiene cada versículo del capítulo:
 * `{ "1": 4, "16": 10 }`. Solo números — el cliente lo pide al abrir el capítulo
 * para pintar el indicador junto a cada versículo, así que tiene que ser
 * diminuto. Los versículos sin referencias no aparecen.
 */
export function getChapterXrefCounts(req: Request, res: Response) {
  const version = resolveVersionId(req);
  const names = bookNames(version);
  const book = decodeURIComponent(req.params.book);
  const bookIdx = names.indexOf(book);
  if (bookIdx < 0) { res.json({}); return; }

  const chapter = parseInt(req.params.chapter, 10);
  if (!Number.isFinite(chapter)) { res.json({}); return; }

  const counts = loadXrefCounts()[`${bookIdx}.${chapter}`] ?? {};

  // En una versión local se filtran los versículos que esa edición no trae (las
  // biblias históricas omiten algunos): un indicador junto a un versículo que no
  // existe no llevaría a ninguna parte. Las remotas traen la Biblia completa.
  if (isRemote(version)) { res.json(counts); return; }
  const chapterData = loadVersion(version).data[book]?.[String(chapter)];
  if (!chapterData) { res.json({}); return; }
  const filtered: Record<string, number> = {};
  for (const verse of Object.keys(chapterData)) {
    if (counts[verse]) filtered[verse] = counts[verse];
  }
  res.json(filtered);
}

/**
 * Las referencias cruzadas de UN versículo, con el texto de cada pasaje ya
 * resuelto en la versión activa. Una sola petición pinta el panel entero: sin
 * esto el cliente tendría que pedir 10 versículos sueltos.
 */
export async function getVerseXrefs(req: Request, res: Response) {
  const version = resolveVersionId(req);
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
    results: await resolveTargets(targets, version),
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
/**
 * Los pasajes de un tema, con su texto, en la versión pedida.
 *
 * Las versiones remotas (RVR60) piden sus capítulos a api.biblia.com: un tema
 * son ~7 pasajes, y `fetchChapter` cachea 6 h, así que el coste real es de unas
 * pocas llamadas la primera vez del día. Los capítulos se piden en PARALELO
 * (secuencial serían ~7 idas y vueltas).
 *
 * Si en la versión pedida no queda ningún pasaje (biblia parcial, o la API
 * remota falló) se reintenta con la versión por defecto: mejor el tema en
 * RV1909 —y diciéndolo en `version`— que una pestaña de temas vacía.
 */
async function buildTopicPayload(topic: Topic, requested: VersionId) {
  const resolve = async (version: VersionId): Promise<TopicPassage[]> => {
    const parts = await Promise.all(
      topic.refs.map(async (ref) => {
        const [bookIdx, chapter, from, to] = ref;
        const p = await passageIn(version, bookIdx, chapter, from, to);
        // Un pasaje que no existe en esta versión se omite en vez de salir vacío.
        if (!p) return null;
        const realLast = p.verses[p.verses.length - 1].verse;
        const passage: TopicPassage = {
          book: p.book,
          chapter: String(chapter),
          from: String(from),
          ...(realLast !== String(from) ? { to: realLast } : {}),
          label: `${p.book} ${chapter}:${from}${realLast !== String(from) ? `-${realLast}` : ''}`,
          verses: p.verses,
        };
        return passage;
      })
    );
    return parts.filter((p): p is TopicPassage => p !== null);
  };

  let version = requested;
  let passages = await resolve(version);
  if (!passages.length && requested !== DEFAULT_VERSION) {
    version = DEFAULT_VERSION;
    passages = await resolve(version);
  }

  return {
    key: topic.key,
    title: topic.title,
    description: topic.description,
    category: topic.category,
    emoji: topic.emoji,
    version,
    passages,
  };
}

export async function getTopicDetail(req: Request, res: Response) {
  const topic = getTopic(req.params.key);
  if (!topic) {
    res.status(404).json({ error: 'Tema no encontrado' });
    return;
  }
  res.json(await buildTopicPayload(topic, resolveVersionId(req)));
}

/**
 * GET /bible/topics/daily?tz=&version= — el TEMA DEL DÍA.
 *
 * Mismo principio que el versículo del día: se deriva de la fecha (no al azar),
 * así que es el mismo para toda la comunidad y se puede compartir y comentar.
 * `tz` decide de qué día hablamos. El catálogo tiene 26 temas: el ciclo entero
 * dura 26 días y se recorre sin repetir.
 *
 * Se sirve con el texto ya resuelto (los mismos `passages` que el detalle del
 * tema) para que la tarjeta pueda enseñar un versículo de muestra y compartir
 * el pasaje sin una segunda petición.
 */
export async function getDailyTopic(req: Request, res: Response) {
  const tz = (req.query.tz as string) || 'UTC';
  let dateKey: string;
  try {
    dateKey = localDateKey(new Date(), tz);
  } catch {
    dateKey = localDateKey(new Date(), 'UTC');
  }

  const topic = topicOfDay(dateKey);
  const payload = await buildTopicPayload(topic, resolveVersionId(req));
  res.json({ date: dateKey, ...payload });
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

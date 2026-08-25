// Acceso a api.biblia.com (Faithlife/Logos) para versiones "solo en línea" que
// NO se pueden distribuir completas por copyright (RVR60: © Sociedades Bíblicas
// Unidas 1960). La key vive en el servidor (BIBLIA_API_KEY); los clientes usan
// los mismos endpoints de siempre y nunca ven la key.
//
// Límites autoimpuestos para respetar los términos de la plataforma:
// - Solo se pide CAPÍTULOS sueltos (nunca el texto completo de la Biblia).
// - Caché en memoria por capítulo, TTL de 6 h y acotada (200 capítulos LRU).
// - `/bible/download` se niega para estas versiones (400): no hay copia local.
import { BOOK_ORDERS } from '../lib/bibleNames';

const BIBLIA_API = 'https://api.biblia.com/v1';
const KEY = process.env.BIBLIA_API_KEY ?? '';
const CHAPTER_TTL = 6 * 3600 * 1000; // 6 h
const MAX_CHAPTERS = 200;

interface ChapterVerses { verse: string; text: string }

const chapterCache = new Map<string, { at: number; verses: ChapterVerses[] }>();

async function apiGet(path: string): Promise<any> {
  if (!KEY) throw new Error('BIBLIA_API_KEY no configurada');
  const r = await fetch(`${BIBLIA_API}${path}${path.includes('?') ? '&' : '?'}key=${KEY}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Biblia API respondió ${r.status}`);
  return r.json();
}

/**
 * Capítulo completo con formato "1.texto 2.texto …" (eachVerse).
 * El pasaje se pide con el NOMBRE DE LIBRO EN INGLÉS ("John3"), que es como la
 * API referencia los libros para cualquier idioma.
 */
export async function fetchChapter(
  bibleId: string,
  bookEn: string,
  chapter: string
): Promise<ChapterVerses[]> {
  const cacheKey = `${bibleId}|${bookEn}|${chapter}`;
  const hit = chapterCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CHAPTER_TTL) return hit.verses;

  const j = await apiGet(
    `/bible/content/${bibleId}.text.json?passage=${encodeURIComponent(bookEn + chapter)}` +
      `&paragraphs=false&eachVerse=${encodeURIComponent('[VerseNum].[VerseText]')}`
  );
  const raw: string = String(j?.text ?? '');
  const verses: ChapterVerses[] = [];
  // `\b` antes del número evita cortar dentro de "10." en "…10.Respondió…" (el
  // lookahead sin \b coincidía también en "0." y partía el capítulo).
  for (const part of raw.split(/(?=\b\d+\.)/)) {
    const m = part.match(/^(\d+)\.([\s\S]*)$/);
    if (m && m[2].trim()) verses.push({ verse: m[1], text: m[2].trim() });
  }
  if (!verses.length) throw new Error('Capítulo vacío de la API');

  chapterCache.set(cacheKey, { at: Date.now(), verses });
  if (chapterCache.size > MAX_CHAPTERS) {
    const oldest = chapterCache.keys().next().value;
    if (oldest) chapterCache.delete(oldest);
  }
  return verses;
}

/** Búsqueda: títulos "Book 3:16" (en inglés) + preview con el texto. */
export async function searchBible(
  bibleId: string,
  query: string
): Promise<{ bookEn: string; chapter: string; verse: string; text: string }[]> {
  const j = await apiGet(`/bible/search/${bibleId}?query=${encodeURIComponent(query)}&limit=1000`);
  const out: { bookEn: string; chapter: string; verse: string; text: string }[] = [];
  for (const r of j?.results ?? []) {
    const m = String(r?.title ?? '').match(/^(.+?)\s(\d+):(\d+)$/);
    if (!m) continue;
    const text = String(r?.preview ?? '').trim();
    if (!text) continue;
    out.push({ bookEn: m[1], chapter: m[2], verse: m[3], text });
  }
  return out;
}

/** Nombres de libro en inglés, en orden canónico (para traducir Juan → John). */
export function englishBookNames(): string[] {
  return BOOK_ORDERS.en;
}

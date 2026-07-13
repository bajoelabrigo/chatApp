// Constantes y utilidades de la Biblia, fuera de la pantalla.
//
// Estaban dentro de `app/(tabs)/bible.tsx`, que había crecido a ~3.500 líneas.
// Vivir aquí permite que las use también cualquier componente extraído
// (tarjetas, modales) sin importar la pantalla.

import { HIGHLIGHT_PALETTE } from '../utils/highlightPalette';
import { WEB_URL } from '../components/ShareSheet';

export type ScreenView =
  | 'books'
  | 'chapters'
  | 'reading'
  | 'search'
  | 'favorites'
  | 'notes'
  | 'plans'
  | 'memorize'
  | 'topics';

export type BookOrder = 'traditional' | 'alphabetical';
export type ReadingTheme = 'default' | 'sepia';
export type ReadingFont = 'sans' | 'serif';

export interface VerseItem {
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

// Accesos rápidos de la barra de acciones: los 4 primeros de la paleta (los 6
// con su significado están en el modal de resaltado).
export const HIGHLIGHT_COLORS = HIGHLIGHT_PALETTE.slice(0, 4).map((c) => c.value);

export const SEARCH_HISTORY_KEY = 'bible_search_history';
export const READING_THEME_KEY = 'bible_reading_theme';
export const READING_FONT_KEY = 'bible_reading_font';

// Tema sepia (papel) para lectura larga. Solo afecta al texto de los versículos;
// el resto de la pantalla sigue con el tema claro/oscuro de la app.
export const SEPIA_BG = '#f4ecd8';
export const SEPIA_TEXT = '#433422';

export const MIN_FONT = 13;
export const MAX_FONT = 26;

export const VERSION_META: Record<string, { name: string; short: string; lang: string }> = {
  RV1909:  { name: 'Reina Valera 1909',         short: 'RV 1909',  lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada',  short: 'RVA',      lang: 'es' },
  SSE:     { name: 'Sagradas Escrituras 1569',  short: 'SSE 1569', lang: 'es' },
  KJV:     { name: 'King James Version',        short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',       short: 'WEB',      lang: 'en' },
  ASV:     { name: 'American Standard Version', short: 'ASV',      lang: 'en' },
  BBE:     { name: 'Bible in Basic English',    short: 'BBE',      lang: 'en' },
};

// Ids de todas las versiones (p.ej. para comprobar cuáles están descargadas).
export const VERSION_IDS = Object.keys(VERSION_META);

export const shortOf = (version: string): string =>
  VERSION_META[version]?.short ?? version;

// Español (RVA / SSE / RV1909) — Evangelios sin prefijo.
// La RVR1960 (única que usaba "S. Mateo", "S.Juan") se retiró por copyright.
export const CANONICAL_ORDER_RVA = [
  'Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio',
  'Josué', 'Jueces', 'Rut', '1 Samuel', '2 Samuel',
  '1 Reyes', '2 Reyes', '1 Crónicas', '2 Crónicas', 'Esdras',
  'Nehemías', 'Ester', 'Job', 'Salmos', 'Proverbios',
  'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones',
  'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós',
  'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc',
  'Sofonías', 'Hageo', 'Zacarías', 'Malaquías',
  'Mateo', 'Marcos', 'Lucas', 'Juan',
  'Hechos', 'Romanos', '1 Corintios', '2 Corintios', 'Gálatas',
  'Efesios', 'Filipenses', 'Colosenses', '1 Tesalonicenses', '2 Tesalonicenses',
  '1 Timoteo', '2 Timoteo', 'Tito', 'Filemón', 'Hebreos',
  'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan',
  '3 Juan', 'Judas', 'Apocalipsis',
];

// KJV / WEB / ASV / BBE — nombres en inglés
export const CANONICAL_ORDER_EN = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John',
  'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John',
  '3 John', 'Jude', 'Revelation',
];

// Todas las versiones en español usan los mismos nombres de libro (SSE y RV1909
// se convirtieron a propósito con los de la RVA) y todas las inglesas los de
// KJV/WEB — así el orden canónico son solo dos listas y los libros emparejan
// entre versiones (vista paralela) sin tablas extra.
export function getCanonicalOrder(version: string): string[] {
  return VERSION_META[version]?.lang === 'en' ? CANONICAL_ORDER_EN : CANONICAL_ORDER_RVA;
}

// Enlace público de un versículo: abre el pasaje en la Biblia de la web.
// La vista previa de WhatsApp/Facebook la resuelve nginx, que manda a los BOTS
// de esta misma URL al endpoint de Open Graph del backend web (los scrapers no
// ejecutan JS, así que la SPA sola solo les daría el logo genérico).
export function verseLink(v: VerseItem, version: string): string {
  const ref = encodeURIComponent(`${v.book} ${v.chapter}:${v.verse}`);
  return `${WEB_URL}/bible?ref=${ref}&v=${version}`;
}

export function formatForShare(
  verses: VerseItem[],
  versionName: string,
  version: string
): string {
  const body = verses
    .map((v) => `${v.book} ${v.chapter}:${v.verse}\n${v.text}`)
    .join('\n\n');
  // Con un solo versículo se adjunta su enlace: quien lo reciba puede abrir el
  // pasaje entero (y ve la vista previa antes de tocarlo).
  const link = verses.length === 1 ? `\n\n${verseLink(verses[0], version)}` : '';
  return `${body}${link}\n\n—Biblia ${versionName}`;
}

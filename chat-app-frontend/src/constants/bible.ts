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

export const VERSION_META: Record<string, { name: string; short: string; lang: string; remote?: boolean }> = {
  RV1909:  { name: 'Reina Valera 1909',         short: 'RV 1909',  lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada',  short: 'RVA',      lang: 'es' },
  SSE:     { name: 'Sagradas Escrituras 1569',  short: 'SSE 1569', lang: 'es' },
  RV1865:  { name: 'Reina Valera 1865',         short: 'RV 1865',  lang: 'es' },
  KJV:     { name: 'King James Version',        short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',       short: 'WEB',      lang: 'en' },
  ASV:     { name: 'American Standard Version', short: 'ASV',      lang: 'en' },
  BBE:     { name: 'Bible in Basic English',    short: 'BBE',      lang: 'en' },
  DARBY:   { name: 'Darby Bible',               short: 'Darby',    lang: 'en' },
  YLT:     { name: "Young's Literal Translation", short: 'YLT',    lang: 'en' },
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
  MARTIN:     { name: 'Bible David Martin 1744',   short: 'Martin',     lang: 'fr' },
  SVV:        { name: 'Statenvertaling 1637',      short: 'SVV',        lang: 'nl' },
  ELBERFELDER: { name: 'Unrevidierte Elberfelder 1905', short: 'Elberfelder', lang: 'de' },
  SYNODAL:    { name: 'Ruso Sinodal 1876',         short: 'Sinodal',    lang: 'ru' },
  ESPERANTO:  { name: 'Londona Biblio (Esperanto)', short: 'Esperanto', lang: 'eo' },
  VAMVAS:     { name: 'Vamvas 1850 (Griego)',      short: 'Vamvas',     lang: 'el' },
  // Solo en línea (api.biblia.com): la RVR1960 tiene copyright de SBU — no se
  // puede descargar para offline; el backend la sirve verso a verso.
  RVR60:      { name: 'Reina Valera 1960',         short: 'RVR60',      lang: 'es', remote: true },
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

// Órdenes canónicos por idioma. Los nombres DEBEN coincidir exactamente con las
// claves de los JSON del backend (bible/<ID>.json). Espejo de
// chat-app-backend/src/lib/bibleNames.ts — al tocar uno, editar los dos.
export const CANONICAL_ORDER_FR = [
  'Genèse', 'Exode', 'Lévitique', 'Nombres', 'Deutéronome',
  'Josué', 'Juges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Rois', '2 Rois', '1 Chroniques', '2 Chroniques', 'Esdras',
  'Néhémie', 'Esther', 'Job', 'Psaumes', 'Proverbes',
  'Ecclésiaste', 'Cantique des cantiques', 'Ésaïe', 'Jérémie', 'Lamentations',
  'Ézéchiel', 'Daniel', 'Osée', 'Joël', 'Amos',
  'Abdias', 'Jonas', 'Michée', 'Nahum', 'Habacuc',
  'Sophonie', 'Aggée', 'Zacharie', 'Malachie',
  'Matthieu', 'Marc', 'Luc', 'Jean',
  'Actes', 'Romains', '1 Corinthiens', '2 Corinthiens', 'Galates',
  'Éphésiens', 'Philippiens', 'Colossiens', '1 Thessaloniciens', '2 Thessaloniciens',
  '1 Timothée', '2 Timothée', 'Tite', 'Philémon', 'Hébreux',
  'Jacques', '1 Pierre', '2 Pierre', '1 Jean', '2 Jean',
  '3 Jean', 'Jude', 'Apocalypse',
];
export const CANONICAL_ORDER_NL = [
  'Genesis', 'Exodus', 'Leviticus', 'Numeri', 'Deuteronomium',
  'Jozua', 'Rechters', 'Ruth', '1 Samuël', '2 Samuël',
  '1 Koningen', '2 Koningen', '1 Kronieken', '2 Kronieken', 'Ezra',
  'Nehemia', 'Esther', 'Job', 'Psalmen', 'Spreuken',
  'Prediker', 'Hooglied', 'Jesaja', 'Jeremia', 'Klaagliederen',
  'Ezechiël', 'Daniël', 'Hosea', 'Joël', 'Amos',
  'Obadja', 'Jona', 'Micha', 'Nahum', 'Habakuk',
  'Zefanja', 'Haggai', 'Zacharia', 'Maleachi',
  'Mattheüs', 'Marcus', 'Lucas', 'Johannes',
  'Handelingen', 'Romeinen', '1 Korinthiërs', '2 Korinthiërs', 'Galaten',
  'Efeziërs', 'Filippenzen', 'Kolossenzen', '1 Thessalonicenzen', '2 Thessalonicenzen',
  '1 Timotheüs', '2 Timotheüs', 'Titus', 'Filemon', 'Hebreeën',
  'Jakobus', '1 Petrus', '2 Petrus', '1 Johannes', '2 Johannes',
  '3 Johannes', 'Judas', 'Openbaring',
];
export const CANONICAL_ORDER_DE = [
  '1. Mose', '2. Mose', '3. Mose', '4. Mose', '5. Mose',
  'Josua', 'Richter', 'Ruth', '1. Samuel', '2. Samuel',
  '1. Könige', '2. Könige', '1. Chronika', '2. Chronika', 'Esra',
  'Nehemia', 'Esther', 'Hiob', 'Psalmen', 'Sprüche',
  'Prediger', 'Hohelied', 'Jesaja', 'Jeremia', 'Klagelieder',
  'Hesekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadja', 'Jona', 'Micha', 'Nahum', 'Habakuk',
  'Zephanja', 'Haggai', 'Sacharja', 'Maleachi',
  'Matthäus', 'Markus', 'Lukas', 'Johannes',
  'Apostelgeschichte', 'Römer', '1. Korinther', '2. Korinther', 'Galater',
  'Epheser', 'Philipper', 'Kolosser', '1. Thessalonicher', '2. Thessalonicher',
  '1. Timotheus', '2. Timotheus', 'Titus', 'Philemon', 'Hebräer',
  'Jakobus', '1. Petrus', '2. Petrus', '1. Johannes', '2. Johannes',
  '3. Johannes', 'Judas', 'Offenbarung',
];
export const CANONICAL_ORDER_RU = [
  'Бытие', 'Исход', 'Левит', 'Числа', 'Второзаконие',
  'Иисус Навин', 'Судьи', 'Руфь', '1 Царств', '2 Царств',
  '3 Царств', '4 Царств', '1 Паралипоменон', '2 Паралипоменон', 'Ездра',
  'Неемия', 'Есфирь', 'Иов', 'Псалтирь', 'Притчи',
  'Екклесиаст', 'Песни Песней', 'Исаия', 'Иеремия', 'Плач Иеремии',
  'Иезекииль', 'Даниил', 'Осия', 'Иоиль', 'Амос',
  'Авдий', 'Иона', 'Михей', 'Наум', 'Аввакум',
  'Софония', 'Аггей', 'Захария', 'Малахия',
  'Матфея', 'Марка', 'Луки', 'Иоанна',
  'Деяния', 'Римлянам', '1 Коринфянам', '2 Коринфянам', 'Галатам',
  'Ефесянам', 'Филиппийцам', 'Колоссянам', '1 Фессалоникийцам', '2 Фессалоникийцам',
  '1 Тимофею', '2 Тимофею', 'Титу', 'Филимону', 'Евреям',
  'Иакова', '1 Петра', '2 Петра', '1 Иоанна', '2 Иоанна',
  '3 Иоанна', 'Иуды', 'Откровение',
];
export const CANONICAL_ORDER_EO = [
  'Genezo', 'Eliro', 'Levidoj', 'Nombroj', 'Readmono',
  'Josuo', 'Juĝistoj', 'Rut', '1 Samuel', '2 Samuel',
  '1 Reĝoj', '2 Reĝoj', '1 Kroniko', '2 Kroniko', 'Ezra',
  'Neĥemja', 'Ester', 'Ijob', 'Psalmaro', 'Sentencoj',
  'Predikanto', 'Alta Kanto', 'Jesaja', 'Jeremia', 'Plorkantoj',
  'Jeĥezkel', 'Daniel', 'Hoŝea', 'Joel', 'Amos',
  'Obadja', 'Jona', 'Miĥa', 'Naĥum', 'Ĥabakuk',
  'Cefanja', 'Ĥagaj', 'Zeĥarja', 'Malaĥi',
  'Mateo', 'Marko', 'Luko', 'Johano',
  'Agoj', 'Romanoj', '1 Korintanoj', '2 Korintanoj', 'Galatoj',
  'Efesanoj', 'Filipianoj', 'Koloseanoj', '1 Tesalonikanoj', '2 Tesalonikanoj',
  '1 Timoteo', '2 Timoteo', 'Tito', 'Filemon', 'Hebreoj',
  'Jakobo', '1 Petro', '2 Petro', '1 Johano', '2 Johano',
  '3 Johano', 'Judaso', 'Apokalipso',
];
export const CANONICAL_ORDER_EL = [
  'Γένεσις', 'Έξοδος', 'Λευιτικόν', 'Αριθμοί', 'Δευτερονόμιον',
  'Ιησούς του Ναυή', 'Κριταί', 'Ρουθ', 'Α΄ Σαμουήλ', 'Β΄ Σαμουήλ',
  'Α΄ Βασιλέων', 'Β΄ Βασιλέων', 'Α΄ Χρονικών', 'Β΄ Χρονικών', 'Έσδρας',
  'Νεεμίας', 'Εσθήρ', 'Ιώβ', 'Ψαλμοί', 'Παροιμίαι',
  'Εκκλησιαστής', 'Άσμα Ασμάτων', 'Ησαΐας', 'Ιερεμίας', 'Θρήνοι',
  'Ιεζεκιήλ', 'Δανιήλ', 'Ωσηέ', 'Ιωήλ', 'Αμώς',
  'Οβδιού', 'Ιωνάς', 'Μιχαίας', 'Ναούμ', 'Αββακούμ',
  'Σοφονίας', 'Αγγαίος', 'Ζαχαρίας', 'Μαλαχίας',
  'Ματθαίον', 'Μάρκον', 'Λουκάν', 'Ιωάννην',
  'Πράξεις', 'Ρωμαίους', 'Α΄ Κορινθίους', 'Β΄ Κορινθίους', 'Γαλάτας',
  'Εφεσίους', 'Φιλιππησίους', 'Κολοσσαείς', 'Α΄ Θεσσαλονικείς', 'Β΄ Θεσσαλονικείς',
  'Α΄ Τιμόθεον', 'Β΄ Τιμόθεον', 'Τίτον', 'Φιλήμονα', 'Εβραίους',
  'Ιακώβου', 'Α΄ Πέτρου', 'Β΄ Πέτρου', 'Α΄ Ιωάννου', 'Β΄ Ιωάννου',
  'Γ΄ Ιωάννου', 'Ιούδα', 'Αποκάλυψιν',
];

export const CANONICAL_ORDERS: Record<string, string[]> = {
  es: CANONICAL_ORDER_RVA,
  en: CANONICAL_ORDER_EN,
  fr: CANONICAL_ORDER_FR,
  nl: CANONICAL_ORDER_NL,
  de: CANONICAL_ORDER_DE,
  ru: CANONICAL_ORDER_RU,
  eo: CANONICAL_ORDER_EO,
  el: CANONICAL_ORDER_EL,
};

export function getCanonicalOrder(version: string): string[] {
  return CANONICAL_ORDERS[VERSION_META[version]?.lang] ?? CANONICAL_ORDER_RVA;
}

// Bandera/icono del idioma de una versión (selector de versiones).
export const LANG_FLAGS: Record<string, string> = {
  es: '🇪🇸', en: '🇬🇧', fr: '🇫🇷', nl: '🇳🇱', de: '🇩🇪', ru: '🇷🇺', eo: '🌍', el: '🇬🇷',
};
export const langFlag = (lang?: string): string => LANG_FLAGS[lang ?? 'es'] ?? '📖';

// Nombre legible del idioma (chips del selector de versiones).
export const LANG_NAMES: Record<string, string> = {
  es: 'Español', en: 'English', fr: 'Français', nl: 'Nederlands',
  de: 'Deutsch', ru: 'Русский', eo: 'Esperanto', el: 'Ελληνικά',
};
export const langLabel = (lang?: string): string => LANG_NAMES[lang ?? 'es'] ?? lang ?? '';

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

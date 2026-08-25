// Órdenes canónicos de los 66 libros por idioma.
//
// Cada versión declara su idioma en VERSION_META (`lang`) y este registro
// resuelve el orden canónico y los nombres de libro de ese idioma. El índice
// en el array = posición canónica (0–65; Mateo en el 39 abre el Nuevo
// Testamento). Los nombres DEBEN coincidir exactamente con las claves del JSON
// de cada versión (bible/<ID>.json), que se convierten con esos mismos nombres.
//
// Al añadir un idioma nuevo: definir el array aquí + en el móvil
// (src/constants/bible.ts → CANONICAL_ORDERS) + en la web
// (holy_app/frontend/src/lib/bibleOrder.js → ORDER_INDEX), y marcar la versión
// con el nuevo `lang` en los tres VERSION_META.
import { BOOK_NAMES } from './readingPlans';
import { BOOK_NAMES_EN } from './dailyVerses';

export type BibleLang = 'es' | 'en' | 'fr' | 'nl' | 'de' | 'ru' | 'eo' | 'el';

export const BOOK_ORDERS: Record<BibleLang, string[]> = {
  // es/en reutilizan las listas existentes (fuente única).
  es: BOOK_NAMES,
  en: BOOK_NAMES_EN,

  // Francés (Bible David Martin 1744)
  fr: [
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
  ],

  // Neerlandés (Statenvertaling)
  nl: [
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
  ],

  // Alemán (Unrevidierte Elberfelder 1905)
  de: [
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
  ],

  // Ruso (Synodal 1876)
  ru: [
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
  ],

  // Esperanto (Londona Biblio)
  eo: [
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
  ],

  // Griego (Vamvas 1850)
  el: [
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
  ],
};

/** Nombres de libro del idioma de una versión (cae a español si el idioma no está). */
export function namesFor(lang: BibleLang): string[] {
  return BOOK_ORDERS[lang] ?? BOOK_ORDERS.es;
}

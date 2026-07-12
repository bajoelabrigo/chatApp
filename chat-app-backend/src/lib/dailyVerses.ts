// Versículo del día (feature #8).
//
// Lista curada de pasajes conocidos: sacar un versículo al azar de toda la
// Biblia (lo que hacía la web) saca sobre todo genealogías y medidas del
// tabernáculo. Aquí el pool está escogido a mano.
//
// Los pasajes se referencian por ÍNDICE DE LIBRO (0–65, orden canónico), igual
// que los planes de lectura (`readingPlans.ts`), para ser agnósticos de versión:
// el nombre del libro se resuelve al de la versión pedida.
//
// El versículo es el MISMO para todos los usuarios el mismo día (se calcula a
// partir de la fecha, no al azar): así se puede compartir y comentar entre la
// comunidad, y el push y la tarjeta coinciden.

export interface DailyRef {
  book: number; // índice canónico 0–65
  chapter: number;
  verse: number;
}

// Nombres de libro en inglés (KJV/WEB/ASV/BBE), mismo orden que BOOK_NAMES_ES
// de readingPlans.ts. Necesarios para resolver el índice al nombre real de la
// versión que pide el cliente.
export const BOOK_NAMES_EN: string[] = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew',
  'Mark', 'Luke', 'John', 'Acts', 'Romans',
  '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians',
  'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter',
  '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

// Pool de versículos. Ampliarlo es seguro: al añadir al final solo cambia qué
// día toca cada uno, no rompe nada.
export const DAILY_VERSES: DailyRef[] = [
  { book: 0, chapter: 1, verse: 1 },      // Génesis 1:1
  { book: 0, chapter: 1, verse: 27 },
  { book: 0, chapter: 28, verse: 15 },
  { book: 1, chapter: 14, verse: 14 },    // Éxodo 14:14
  { book: 1, chapter: 20, verse: 12 },
  { book: 3, chapter: 6, verse: 24 },     // Números 6:24
  { book: 4, chapter: 6, verse: 5 },      // Deuteronomio 6:5
  { book: 4, chapter: 31, verse: 6 },
  { book: 5, chapter: 1, verse: 9 },      // Josué 1:9
  { book: 5, chapter: 24, verse: 15 },
  { book: 8, chapter: 16, verse: 7 },     // 1 Samuel 16:7
  { book: 12, chapter: 16, verse: 11 },   // 1 Crónicas 16:11
  { book: 13, chapter: 7, verse: 14 },    // 2 Crónicas 7:14
  { book: 15, chapter: 8, verse: 10 },    // Nehemías 8:10
  { book: 17, chapter: 19, verse: 25 },   // Job 19:25
  { book: 18, chapter: 1, verse: 1 },     // Salmos
  { book: 18, chapter: 16, verse: 8 },
  { book: 18, chapter: 18, verse: 2 },
  { book: 18, chapter: 19, verse: 14 },
  { book: 18, chapter: 23, verse: 1 },
  { book: 18, chapter: 27, verse: 1 },
  { book: 18, chapter: 27, verse: 14 },
  { book: 18, chapter: 32, verse: 8 },
  { book: 18, chapter: 34, verse: 8 },
  { book: 18, chapter: 34, verse: 18 },
  { book: 18, chapter: 37, verse: 4 },
  { book: 18, chapter: 37, verse: 5 },
  { book: 18, chapter: 46, verse: 1 },
  { book: 18, chapter: 46, verse: 10 },
  { book: 18, chapter: 51, verse: 10 },
  { book: 18, chapter: 55, verse: 22 },
  { book: 18, chapter: 62, verse: 1 },
  { book: 18, chapter: 91, verse: 1 },
  { book: 18, chapter: 91, verse: 11 },
  { book: 18, chapter: 100, verse: 4 },
  { book: 18, chapter: 103, verse: 2 },
  { book: 18, chapter: 118, verse: 24 },
  { book: 18, chapter: 119, verse: 105 },
  { book: 18, chapter: 121, verse: 1 },
  { book: 18, chapter: 127, verse: 1 },
  { book: 18, chapter: 133, verse: 1 },
  { book: 18, chapter: 139, verse: 14 },
  { book: 18, chapter: 143, verse: 8 },
  { book: 18, chapter: 147, verse: 3 },
  { book: 19, chapter: 3, verse: 5 },     // Proverbios 3:5
  { book: 19, chapter: 3, verse: 6 },
  { book: 19, chapter: 4, verse: 23 },
  { book: 19, chapter: 11, verse: 25 },
  { book: 19, chapter: 15, verse: 1 },
  { book: 19, chapter: 16, verse: 3 },
  { book: 19, chapter: 16, verse: 9 },
  { book: 19, chapter: 17, verse: 17 },
  { book: 19, chapter: 18, verse: 10 },
  { book: 19, chapter: 22, verse: 6 },
  { book: 19, chapter: 27, verse: 17 },
  { book: 20, chapter: 3, verse: 1 },     // Eclesiastés 3:1
  { book: 20, chapter: 4, verse: 9 },
  { book: 22, chapter: 26, verse: 3 },    // Isaías 26:3
  { book: 22, chapter: 40, verse: 8 },
  { book: 22, chapter: 40, verse: 29 },
  { book: 22, chapter: 40, verse: 31 },
  { book: 22, chapter: 41, verse: 10 },
  { book: 22, chapter: 43, verse: 2 },
  { book: 22, chapter: 43, verse: 19 },
  { book: 22, chapter: 53, verse: 5 },
  { book: 22, chapter: 55, verse: 8 },
  { book: 22, chapter: 55, verse: 11 },
  { book: 23, chapter: 1, verse: 5 },     // Jeremías 1:5
  { book: 23, chapter: 17, verse: 7 },
  { book: 23, chapter: 29, verse: 11 },
  { book: 23, chapter: 33, verse: 3 },
  { book: 24, chapter: 3, verse: 22 },    // Lamentaciones 3:22
  { book: 24, chapter: 3, verse: 23 },
  { book: 25, chapter: 36, verse: 26 },   // Ezequiel 36:26
  { book: 26, chapter: 3, verse: 17 },    // Daniel 3:17
  { book: 27, chapter: 6, verse: 3 },     // Oseas 6:3
  { book: 28, chapter: 2, verse: 25 },    // Joel 2:25
  { book: 32, chapter: 6, verse: 8 },     // Miqueas 6:8
  { book: 34, chapter: 3, verse: 19 },    // Habacuc 3:19
  { book: 35, chapter: 3, verse: 17 },    // Sofonías 3:17
  { book: 38, chapter: 3, verse: 10 },    // Malaquías 3:10
  { book: 39, chapter: 5, verse: 9 },     // Mateo
  { book: 39, chapter: 5, verse: 14 },
  { book: 39, chapter: 5, verse: 16 },
  { book: 39, chapter: 6, verse: 21 },
  { book: 39, chapter: 6, verse: 33 },
  { book: 39, chapter: 7, verse: 7 },
  { book: 39, chapter: 11, verse: 28 },
  { book: 39, chapter: 19, verse: 26 },
  { book: 39, chapter: 22, verse: 37 },
  { book: 39, chapter: 28, verse: 19 },
  { book: 39, chapter: 28, verse: 20 },
  { book: 40, chapter: 9, verse: 23 },    // Marcos 9:23
  { book: 40, chapter: 11, verse: 24 },
  { book: 41, chapter: 1, verse: 37 },    // Lucas 1:37
  { book: 41, chapter: 6, verse: 31 },
  { book: 41, chapter: 6, verse: 38 },
  { book: 42, chapter: 1, verse: 1 },     // Juan
  { book: 42, chapter: 3, verse: 16 },
  { book: 42, chapter: 8, verse: 12 },
  { book: 42, chapter: 8, verse: 32 },
  { book: 42, chapter: 10, verse: 10 },
  { book: 42, chapter: 13, verse: 34 },
  { book: 42, chapter: 14, verse: 6 },
  { book: 42, chapter: 14, verse: 27 },
  { book: 42, chapter: 15, verse: 5 },
  { book: 42, chapter: 16, verse: 33 },
  { book: 43, chapter: 1, verse: 8 },     // Hechos 1:8
  { book: 43, chapter: 2, verse: 38 },
  { book: 43, chapter: 20, verse: 35 },
  { book: 44, chapter: 5, verse: 8 },     // Romanos
  { book: 44, chapter: 8, verse: 1 },
  { book: 44, chapter: 8, verse: 28 },
  { book: 44, chapter: 8, verse: 31 },
  { book: 44, chapter: 8, verse: 38 },
  { book: 44, chapter: 10, verse: 9 },
  { book: 44, chapter: 12, verse: 2 },
  { book: 44, chapter: 12, verse: 12 },
  { book: 44, chapter: 15, verse: 13 },
  { book: 45, chapter: 10, verse: 13 },   // 1 Corintios 10:13
  { book: 45, chapter: 13, verse: 4 },
  { book: 45, chapter: 13, verse: 13 },
  { book: 45, chapter: 15, verse: 58 },
  { book: 45, chapter: 16, verse: 14 },
  { book: 46, chapter: 4, verse: 18 },    // 2 Corintios 4:18
  { book: 46, chapter: 5, verse: 7 },
  { book: 46, chapter: 5, verse: 17 },
  { book: 46, chapter: 9, verse: 7 },
  { book: 46, chapter: 12, verse: 9 },
  { book: 47, chapter: 2, verse: 20 },    // Gálatas 2:20
  { book: 47, chapter: 5, verse: 22 },
  { book: 47, chapter: 6, verse: 9 },
  { book: 48, chapter: 2, verse: 8 },     // Efesios 2:8
  { book: 48, chapter: 2, verse: 10 },
  { book: 48, chapter: 4, verse: 32 },
  { book: 48, chapter: 6, verse: 10 },
  { book: 49, chapter: 1, verse: 6 },     // Filipenses 1:6
  { book: 49, chapter: 2, verse: 3 },
  { book: 49, chapter: 4, verse: 6 },
  { book: 49, chapter: 4, verse: 7 },
  { book: 49, chapter: 4, verse: 8 },
  { book: 49, chapter: 4, verse: 13 },
  { book: 49, chapter: 4, verse: 19 },
  { book: 50, chapter: 3, verse: 2 },     // Colosenses 3:2
  { book: 50, chapter: 3, verse: 12 },
  { book: 50, chapter: 3, verse: 23 },
  { book: 51, chapter: 5, verse: 11 },    // 1 Tesalonicenses 5:11
  { book: 51, chapter: 5, verse: 16 },
  { book: 51, chapter: 5, verse: 17 },
  { book: 53, chapter: 1, verse: 7 },     // 2 Timoteo 1:7
  { book: 53, chapter: 3, verse: 16 },
  { book: 57, chapter: 4, verse: 12 },    // Hebreos 4:12
  { book: 57, chapter: 10, verse: 24 },
  { book: 57, chapter: 11, verse: 1 },
  { book: 57, chapter: 12, verse: 1 },
  { book: 57, chapter: 13, verse: 5 },
  { book: 57, chapter: 13, verse: 8 },
  { book: 58, chapter: 1, verse: 2 },     // Santiago 1:2
  { book: 58, chapter: 1, verse: 5 },
  { book: 58, chapter: 1, verse: 22 },
  { book: 58, chapter: 4, verse: 8 },
  { book: 58, chapter: 5, verse: 16 },
  { book: 59, chapter: 5, verse: 7 },     // 1 Pedro 5:7
  { book: 60, chapter: 3, verse: 9 },     // 2 Pedro 3:9
  { book: 61, chapter: 1, verse: 9 },     // 1 Juan 1:9
  { book: 61, chapter: 4, verse: 8 },
  { book: 61, chapter: 4, verse: 18 },
  { book: 61, chapter: 4, verse: 19 },
  { book: 65, chapter: 3, verse: 20 },    // Apocalipsis 3:20
  { book: 65, chapter: 21, verse: 4 },
];

/**
 * Día "civil" (YYYY-MM-DD) de una fecha en una zona horaria. Es la clave del
 * versículo: en Madrid y en Lima el día cambia a horas distintas, y cada uno
 * debe ver el suyo.
 */
export function localDateKey(date: Date, timezone = 'UTC'): string {
  // en-CA da directamente YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * El versículo de un día concreto. Determinista: mismo día → mismo versículo
 * para todo el mundo (así se puede compartir y comentar en comunidad).
 * Rota por número de día absoluto, de modo que el pool se recorre entero antes
 * de repetir.
 */
export function getDailyRef(dateKey: string): DailyRef {
  const days = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const i = ((days % DAILY_VERSES.length) + DAILY_VERSES.length) % DAILY_VERSES.length;
  return DAILY_VERSES[i];
}

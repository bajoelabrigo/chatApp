// Referencia rápida (#7): convierte lo que escribe el usuario ("Juan 3:16",
// "1 co 13", "sal 23", "jn3.16") en { book, chapter, verse } usando la lista de
// libros de la versión activa — así el nombre devuelto siempre existe en esa
// versión y se puede pedir al backend tal cual.
//
// Espejo en la web: holy_app/frontend/src/lib/bibleRef.js. Al tocar las
// abreviaturas o el matcher, editar los dos.

export interface BibleRef {
  book: string;
  chapter?: string;
  verse?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de tilde (NFD)
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Abreviaturas → nombre canónico del libro. Las claves van sin espacios ni
// puntos ("1co", "stg"), que es como queda la entrada tras compactarla.
// Español (nombres de la RVA) e inglés (KJV/WEB) en la misma tabla: se busca en
// la lista de libros de la versión, así que no chocan entre sí.
const ALIASES: Record<string, string> = {
  // ── Antiguo Testamento (es)
  gn: 'Génesis', gen: 'Génesis', ge: 'Génesis',
  ex: 'Éxodo', exo: 'Éxodo',
  lv: 'Levítico', lev: 'Levítico',
  nm: 'Números', num: 'Números',
  dt: 'Deuteronomio', deut: 'Deuteronomio', deu: 'Deuteronomio',
  jos: 'Josué',
  jue: 'Jueces', jc: 'Jueces',
  rt: 'Rut',
  '1s': '1 Samuel', '1sa': '1 Samuel', '1sam': '1 Samuel',
  '2s': '2 Samuel', '2sa': '2 Samuel', '2sam': '2 Samuel',
  '1r': '1 Reyes', '1re': '1 Reyes',
  '2r': '2 Reyes', '2re': '2 Reyes',
  '1cr': '1 Crónicas', '2cr': '2 Crónicas',
  esd: 'Esdras', neh: 'Nehemías', est: 'Ester',
  sal: 'Salmos', slm: 'Salmos', sl: 'Salmos', salmo: 'Salmos',
  pr: 'Proverbios', prov: 'Proverbios',
  ec: 'Eclesiastés', ecl: 'Eclesiastés',
  cnt: 'Cantares', cant: 'Cantares',
  is: 'Isaías', isa: 'Isaías',
  jr: 'Jeremías', jer: 'Jeremías',
  lm: 'Lamentaciones', lam: 'Lamentaciones',
  ez: 'Ezequiel', eze: 'Ezequiel',
  dn: 'Daniel', dan: 'Daniel',
  os: 'Oseas', jl: 'Joel', am: 'Amós', abd: 'Abdías', jon: 'Jonás',
  mi: 'Miqueas', miq: 'Miqueas', nah: 'Nahúm', hab: 'Habacuc',
  sof: 'Sofonías', hag: 'Hageo', zac: 'Zacarías', mal: 'Malaquías',
  // ── Nuevo Testamento (es)
  mt: 'Mateo', mat: 'Mateo',
  mr: 'Marcos', mc: 'Marcos', mar: 'Marcos',
  lc: 'Lucas', luc: 'Lucas',
  jn: 'Juan', jua: 'Juan',
  hch: 'Hechos', hec: 'Hechos',
  ro: 'Romanos', rom: 'Romanos',
  '1co': '1 Corintios', '1cor': '1 Corintios',
  '2co': '2 Corintios', '2cor': '2 Corintios',
  ga: 'Gálatas', gal: 'Gálatas',
  ef: 'Efesios', efe: 'Efesios',
  fil: 'Filipenses', flp: 'Filipenses',
  col: 'Colosenses',
  '1ts': '1 Tesalonicenses', '1tes': '1 Tesalonicenses',
  '2ts': '2 Tesalonicenses', '2tes': '2 Tesalonicenses',
  '1ti': '1 Timoteo', '1tim': '1 Timoteo',
  '2ti': '2 Timoteo', '2tim': '2 Timoteo',
  tit: 'Tito', flm: 'Filemón', heb: 'Hebreos',
  stg: 'Santiago', sant: 'Santiago',
  '1p': '1 Pedro', '1pe': '1 Pedro', '2p': '2 Pedro', '2pe': '2 Pedro',
  '1jn': '1 Juan', '2jn': '2 Juan', '3jn': '3 Juan',
  jud: 'Judas', ap: 'Apocalipsis', apoc: 'Apocalipsis',
  // ── Inglés (KJV / WEB / ASV / BBE)
  exod: 'Exodus', josh: 'Joshua', judg: 'Judges',
  '1ki': '1 Kings', '1kgs': '1 Kings', '2ki': '2 Kings', '2kgs': '2 Kings',
  '1ch': '1 Chronicles', '1chr': '1 Chronicles',
  '2ch': '2 Chronicles', '2chr': '2 Chronicles',
  ezr: 'Ezra', ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms',
  eccl: 'Ecclesiastes', ecc: 'Ecclesiastes',
  song: 'Song of Songs', sos: 'Song of Songs',
  ezek: 'Ezekiel', hos: 'Hosea', amos: 'Amos', obad: 'Obadiah',
  jonah: 'Jonah', mic: 'Micah', zeph: 'Zephaniah', zech: 'Zechariah',
  matt: 'Matthew', mk: 'Mark', lk: 'Luke',
  acts: 'Acts', rm: 'Romans',
  eph: 'Ephesians', phil: 'Philippians', php: 'Philippians',
  '1th': '1 Thessalonians', '1thess': '1 Thessalonians',
  '2th': '2 Thessalonians', '2thess': '2 Thessalonians',
  titus: 'Titus', phlm: 'Philemon', philem: 'Philemon',
  jas: 'James', james: 'James',
  '1pet': '1 Peter', '2pet': '2 Peter',
  '1john': '1 John', '2john': '2 John', '3john': '3 John',
  jude: 'Jude', rev: 'Revelation',
};

// "i juan" / "II Reyes" → "1 juan" / "2 reyes"
const romanToDigit = (s: string) =>
  s.replace(/^(i{1,3})\s+/, (_, r: string) => `${r.length} `);

/**
 * Encuentra el libro de `books` (los de la versión activa) que corresponde a lo
 * escrito. Devuelve null si no hay ninguno o si la entrada es tan corta que
 * emparejaría con varios libros distintos.
 */
export function matchBook(query: string, books: string[]): string | null {
  const q = romanToDigit(norm(query));
  if (!q) return null;
  const compact = q.replace(/\s/g, '');

  const byNorm = new Map<string, string>();
  for (const b of books) byNorm.set(norm(b), b);

  // 1. Nombre completo tal cual ("juan", "1 corintios")
  const exact = byNorm.get(q);
  if (exact) return exact;

  // 2. Abreviatura conocida ("jn", "1co", "sal")
  const alias = ALIASES[compact];
  if (alias) {
    const hit = byNorm.get(norm(alias));
    if (hit) return hit;
  }

  // 3. Prefijo ("salmo" → Salmos, "apoca" → Apocalipsis). Con varios candidatos
  //    (p.ej. "juan" ya es exacto arriba, pero "jo" da Job/Joel/Jonás) se
  //    descarta: es mejor no navegar que navegar al libro equivocado.
  const prefixed = books.filter((b) => {
    const n = norm(b);
    return n.startsWith(q) || n.replace(/\s/g, '').startsWith(compact);
  });
  if (prefixed.length === 1) return prefixed[0];

  return null;
}

/**
 * Parsea una referencia completa: "Juan 3:16", "1 co 13", "sal 23", "jn 3 16",
 * "Génesis" (→ solo libro). `chapter`/`verse` van como string porque así los
 * maneja el resto de la Biblia (las claves del JSON son strings).
 */
export function parseReference(input: string, books: string[]): BibleRef | null {
  const raw = (input || '').trim();
  if (!raw || !books?.length) return null;

  // El nombre del libro es perezoso: el regex retrocede hasta que el resto (el
  // capítulo y el versículo opcional) encaja hasta el final. Así "1 Juan 3" no
  // toma el "1" inicial como capítulo.
  const m = raw.match(/^(.*?)\s*(\d+)\s*(?:[:.,\s-]\s*(\d+))?\s*$/);

  const bookPart = m ? m[1] : raw;
  if (!/\p{L}/u.test(bookPart)) return null; // "3:16" sin libro no es referencia

  const book = matchBook(bookPart, books);
  if (!book) return null;

  if (!m) return { book };
  return { book, chapter: m[2], verse: m[3] || undefined };
}

/** "Juan 3:16" — para mostrar la referencia ya reconocida. */
export function formatReference(ref: BibleRef): string {
  return `${ref.book}${ref.chapter ? ` ${ref.chapter}` : ''}${
    ref.verse ? `:${ref.verse}` : ''
  }`;
}

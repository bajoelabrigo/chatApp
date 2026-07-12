// Planes de lectura de la Biblia (feature #2).
//
// Las lecturas se referencian por ÍNDICE DE LIBRO (0–65 en orden canónico
// protestante), NO por nombre, para ser agnósticas de versión: cada cliente
// resuelve el índice al nombre de su versión (RV1909/RVA/SSE/KJV/WEB/ASV/BBE).
// El backend usa nombres en español solo para el texto de los recordatorios push.

// Nº de capítulos por libro (canon protestante, 66 libros, mismo en toda versión).
const CHAPTERS: number[] = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, // Génesis..2 Samuel
  22, 25, 29, 36, 10, 13, 10, 42, 150, 31, // 1 Reyes..Proverbios
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9, // Eclesiastés..Amós
  1, 4, 7, 3, 3, 3, 2, 14, 4, 28, // Abdías..Mateo
  16, 24, 21, 28, 16, 16, 13, 6, 6, 4, // Marcos..Filipenses
  4, 5, 3, 6, 4, 3, 1, 13, 5, 5, // Colosenses..2 Pedro
  3, 5, 1, 1, 1, 22, // 1 Juan..Apocalipsis
];

// Nombres en español (RVR1960 sin el prefijo "S." en los evangelios) para el
// texto de los recordatorios y las etiquetas de cada día.
const BOOK_NAMES_ES: string[] = [
  'Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio',
  'Josué', 'Jueces', 'Rut', '1 Samuel', '2 Samuel',
  '1 Reyes', '2 Reyes', '1 Crónicas', '2 Crónicas', 'Esdras',
  'Nehemías', 'Ester', 'Job', 'Salmos', 'Proverbios',
  'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones',
  'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós',
  'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc',
  'Sofonías', 'Hageo', 'Zacarías', 'Malaquías', 'Mateo',
  'Marcos', 'Lucas', 'Juan', 'Hechos', 'Romanos',
  '1 Corintios', '2 Corintios', 'Gálatas', 'Efesios', 'Filipenses',
  'Colosenses', '1 Tesalonicenses', '2 Tesalonicenses', '1 Timoteo', '2 Timoteo',
  'Tito', 'Filemón', 'Hebreos', 'Santiago', '1 Pedro',
  '2 Pedro', '1 Juan', '2 Juan', '3 Juan', 'Judas', 'Apocalipsis',
];

export interface PlanReference {
  book: number;        // índice canónico 0–65
  startChapter: number;
  endChapter: number;
}

export interface PlanDay {
  day: number;              // 1-based
  references: PlanReference[];
  label: string;            // "Génesis 1–3, Mateo 1"
}

export interface PlanMeta {
  key: string;
  title: string;
  description: string;
  category: string;
  totalDays: number;
}

export interface Plan extends PlanMeta {
  days: PlanDay[];
}

interface PlanConfig {
  key: string;
  title: string;
  description: string;
  category: string;
  // Rango inclusivo de índices de libro [primero, último].
  bookRange: [number, number];
  days: number;
}

const PLAN_CONFIGS: PlanConfig[] = [
  {
    key: 'biblia-1-anio',
    title: 'Biblia en un año',
    description: 'Toda la Biblia en 365 días, de Génesis a Apocalipsis.',
    category: 'Completa',
    bookRange: [0, 65],
    days: 365,
  },
  {
    key: 'nt-90',
    title: 'Nuevo Testamento en 90 días',
    description: 'De Mateo a Apocalipsis en tres meses.',
    category: 'Nuevo Testamento',
    bookRange: [39, 65],
    days: 90,
  },
  {
    key: 'evangelios-30',
    title: 'Evangelios en 30 días',
    description: 'La vida de Jesús: Mateo, Marcos, Lucas y Juan en un mes.',
    category: 'Evangelios',
    bookRange: [39, 42],
    days: 30,
  },
  {
    key: 'salmos-30',
    title: 'Salmos en 30 días',
    description: 'Un recorrido por los 150 Salmos en un mes.',
    category: 'Salmos',
    bookRange: [18, 18],
    days: 30,
  },
  {
    key: 'proverbios-31',
    title: 'Proverbios en 31 días',
    description: 'Un capítulo de Proverbios cada día del mes.',
    category: 'Sabiduría',
    bookRange: [19, 19],
    days: 31,
  },
];

// Todas las unidades (libro, capítulo) del rango, en orden.
function buildUnits([a, b]: [number, number]): { book: number; chapter: number }[] {
  const units: { book: number; chapter: number }[] = [];
  for (let book = a; book <= b; book++) {
    for (let chapter = 1; chapter <= CHAPTERS[book]; chapter++) {
      units.push({ book, chapter });
    }
  }
  return units;
}

// Agrupa capítulos contiguos del mismo libro en rangos.
function groupRefs(dayUnits: { book: number; chapter: number }[]): PlanReference[] {
  const refs: PlanReference[] = [];
  for (const u of dayUnits) {
    const last = refs[refs.length - 1];
    if (last && last.book === u.book && u.chapter === last.endChapter + 1) {
      last.endChapter = u.chapter;
    } else {
      refs.push({ book: u.book, startChapter: u.chapter, endChapter: u.chapter });
    }
  }
  return refs;
}

export function formatReferences(refs: PlanReference[]): string {
  return refs
    .map((r) => {
      const name = BOOK_NAMES_ES[r.book] ?? `Libro ${r.book}`;
      return r.startChapter === r.endChapter
        ? `${name} ${r.startChapter}`
        : `${name} ${r.startChapter}–${r.endChapter}`;
    })
    .join(', ');
}

function generateDays(config: PlanConfig): PlanDay[] {
  const units = buildUnits(config.bookRange);
  const days: PlanDay[] = [];
  const per = units.length / config.days;
  for (let d = 0; d < config.days; d++) {
    const start = Math.floor(d * per);
    const end = Math.floor((d + 1) * per);
    const refs = groupRefs(units.slice(start, end));
    days.push({ day: d + 1, references: refs, label: formatReferences(refs) });
  }
  return days;
}

// Cache: los planes son deterministas, se generan una vez.
const planCache = new Map<string, Plan>();

export function getPlan(key: string): Plan | null {
  if (planCache.has(key)) return planCache.get(key)!;
  const config = PLAN_CONFIGS.find((p) => p.key === key);
  if (!config) return null;
  const plan: Plan = {
    key: config.key,
    title: config.title,
    description: config.description,
    category: config.category,
    totalDays: config.days,
    days: generateDays(config),
  };
  planCache.set(key, plan);
  return plan;
}

export function listPlans(): PlanMeta[] {
  return PLAN_CONFIGS.map((c) => ({
    key: c.key,
    title: c.title,
    description: c.description,
    category: c.category,
    totalDays: c.days,
  }));
}

// Nº total de libros (canon protestante).
export const BOOK_COUNT = CHAPTERS.length; // 66
// Nombres de libros para validación/descripción (mismo orden canónico 0–65).
export const BOOK_NAMES = BOOK_NAMES_ES;

export interface CustomPlanDef {
  title: string;
  bookStart: number; // índice 0–65
  bookEnd: number;   // índice 0–65 (>= bookStart)
  days: number;
}

// Genera un Plan a partir de una definición personalizada del usuario
// (rango de libros + nº de días). Satura los días al nº de capítulos del rango.
export function generateCustomPlan(def: CustomPlanDef): Plan {
  const a = Math.max(0, Math.min(BOOK_COUNT - 1, Math.trunc(def.bookStart)));
  const b = Math.max(a, Math.min(BOOK_COUNT - 1, Math.trunc(def.bookEnd)));
  const units = buildUnits([a, b]);
  const days = Math.max(1, Math.min(Math.trunc(def.days) || 1, units.length));
  const config: PlanConfig = {
    key: 'custom',
    title: def.title || 'Mi plan',
    description: '',
    category: 'Personalizado',
    bookRange: [a, b],
    days,
  };
  return {
    key: 'custom',
    title: config.title,
    description: `${BOOK_NAMES_ES[a]}${a !== b ? ` – ${BOOK_NAMES_ES[b]}` : ''} en ${days} días`,
    category: 'Personalizado',
    totalDays: days,
    days: generateDays(config),
  };
}

// Día de hoy (1-based) del plan según la fecha de inicio y la zona horaria del
// usuario. Se satura en totalDays (no pasa del final).
export function computeCurrentDay(startDate: Date, timezone: string, totalDays: number, now = new Date()): number {
  // Diferencia en días de calendario local entre startDate y hoy.
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const startLocal = new Date(fmt(startDate) + 'T00:00:00Z').getTime();
  const nowLocal = new Date(fmt(now) + 'T00:00:00Z').getTime();
  const diffDays = Math.floor((nowLocal - startLocal) / 86400000);
  return Math.min(Math.max(diffDays + 1, 1), totalDays);
}

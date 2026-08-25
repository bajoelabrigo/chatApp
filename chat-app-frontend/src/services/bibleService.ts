import * as FileSystem from 'expo-file-system/legacy';
import type { DownloadResumable } from 'expo-file-system/legacy';
import api from './authService';
import { fold } from '../utils/textFold';

export interface BibleVerse {
  verse: string;
  text: string;
}

export interface BibleSearchResult {
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

export interface BibleVersion {
  id: string;
  name: string;
  short: string;
  lang: string;
  // Solo lectura en línea (RVR60): no se descarga para offline.
  remote?: boolean;
}

type LocalBible = Record<string, Record<string, Record<string, string>>>;

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

// Versiones retiradas (2026-07-11): la RVR1960 tiene copyright de Sociedades
// Bíblicas Unidas y no se puede distribuir completa. El backend ya no la sirve.
// Aquí importa por dos motivos: (1) migrar a quien la tuviera seleccionada, y
// (2) BORRAR la copia que se quedó descargada en su dispositivo.
export const RETIRED_VERSIONS = ['RVR1960'];
export const DEFAULT_VERSION = 'RV1909';

// Si la versión guardada ya no existe, cae a la por defecto (RV1909: dominio
// público y con un lenguaje casi idéntico a la RVR1960).
export const safeVersion = (v?: string | null): string =>
  !v || RETIRED_VERSIONS.includes(v) ? DEFAULT_VERSION : v;

const getBibleFile = (version: string) =>
  (FileSystem.documentDirectory ?? '') + `bible_${version}.json`;

// In-memory cache keyed by version id
const bibleCache = new Map<string, LocalBible>();
let activeDownload: DownloadResumable | null = null;

// ── Local file helpers ─────────────────────────────────────

async function getLocalBible(version: string): Promise<LocalBible | null> {
  const cached = bibleCache.get(version);
  if (cached) return cached;
  try {
    const info = await FileSystem.getInfoAsync(getBibleFile(version));
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(getBibleFile(version));
    const parsed: LocalBible = JSON.parse(raw);
    bibleCache.set(version, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function isBibleDownloaded(version: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(getBibleFile(version));
  return info.exists;
}

export async function deleteBibleDownload(version: string): Promise<void> {
  await FileSystem.deleteAsync(getBibleFile(version), { idempotent: true });
  bibleCache.delete(version);
}

// Borra del dispositivo las Biblias retiradas. Se llama al abrir la pantalla de
// Biblia: quien tuviera la RVR1960 descargada la seguiría leyendo offline (y la
// app seguiría distribuyendo ese texto) si no se elimina explícitamente.
export async function purgeRetiredBibles(): Promise<void> {
  await Promise.all(
    RETIRED_VERSIONS.map((v) => deleteBibleDownload(v).catch(() => {}))
  );
}

export async function downloadBible(
  token: string,
  version: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const url = `${API_BASE}/bible/download?version=${version}`;

  activeDownload = FileSystem.createDownloadResumable(
    url,
    getBibleFile(version),
    { headers: { Authorization: `Bearer ${token}` } },
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress(totalBytesWritten / totalBytesExpectedToWrite);
      }
    }
  );

  try {
    await activeDownload.downloadAsync();
  } finally {
    activeDownload = null;
  }
  bibleCache.delete(version); // clear so next read re-parses the new file
}

export function cancelBibleDownload(): void {
  activeDownload?.pauseAsync();
  activeDownload = null;
}

// ── API functions (offline-first) ─────────────────────────

export async function fetchVersions(token: string): Promise<BibleVersion[]> {
  const { data } = await api.get<BibleVersion[]>('/bible/versions', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function fetchBooks(token: string, version = DEFAULT_VERSION): Promise<string[]> {
  const bible = await getLocalBible(version);
  if (bible) return Object.keys(bible);
  const { data } = await api.get<string[]>('/bible/books', {
    headers: { Authorization: `Bearer ${token}` },
    params: { version },
  });
  return data;
}

export async function fetchChapters(token: string, book: string, version = DEFAULT_VERSION): Promise<string[]> {
  const bible = await getLocalBible(version);
  if (bible) {
    const bookData = bible[book];
    return bookData ? Object.keys(bookData) : [];
  }
  const { data } = await api.get<string[]>(
    `/bible/${encodeURIComponent(book)}/chapters`,
    { headers: { Authorization: `Bearer ${token}` }, params: { version } }
  );
  return data;
}

export async function fetchVerses(
  token: string,
  book: string,
  chapter: string,
  version = DEFAULT_VERSION
): Promise<BibleVerse[]> {
  const bible = await getLocalBible(version);
  if (bible) {
    const chapterData = bible[book]?.[chapter];
    if (!chapterData) return [];
    return Object.entries(chapterData).map(([verse, text]) => ({ verse, text: text.trim() }));
  }
  const { data } = await api.get<BibleVerse[]>(
    `/bible/${encodeURIComponent(book)}/${chapter}`,
    { headers: { Authorization: `Bearer ${token}` }, params: { version } }
  );
  return data;
}

// ─── Referencias cruzadas ────────────────────────────────────────────────────
//
// Viven SOLO en el servidor (dataset de openbible.info, CC-BY): no se descargan
// con la Biblia, así que sin conexión no hay referencias. Las dos funciones se
// degradan en silencio a "ninguna" en vez de propagar el error — quien lee
// offline debe seguir leyendo, no toparse con una pantalla rota.

export interface CrossRef {
  book: string;
  chapter: string;
  verse: string;
  endVerse?: string;
  text: string;
}

export interface CrossRefs {
  book: string;
  chapter: string;
  verse: string;
  source: string;
  results: CrossRef[];
}

/** Cuántas referencias tiene cada versículo del capítulo: { "16": 10 }. */
export async function fetchChapterXrefCounts(
  token: string,
  book: string,
  chapter: string,
  version = DEFAULT_VERSION
): Promise<Record<string, number>> {
  try {
    const { data } = await api.get<Record<string, number>>(
      `/bible/xrefs/${encodeURIComponent(book)}/${chapter}`,
      { headers: { Authorization: `Bearer ${token}` }, params: { version } }
    );
    return data;
  } catch {
    return {};
  }
}

/** Las referencias de un versículo, con el texto ya resuelto en `version`. */
export async function fetchVerseXrefs(
  token: string,
  book: string,
  chapter: string,
  verse: string,
  version = DEFAULT_VERSION
): Promise<CrossRefs | null> {
  try {
    const { data } = await api.get<CrossRefs>(
      `/bible/xrefs/${encodeURIComponent(book)}/${chapter}/${verse}`,
      { headers: { Authorization: `Bearer ${token}` }, params: { version } }
    );
    return data;
  } catch {
    return null;
  }
}

// Búsqueda paginada: devuelve { results, total, offset }.
//
// - `testament` y `book` acotan el ámbito, y se aplican DENTRO de la búsqueda:
//   como se corta por páginas, filtrar a posteriori dejaba el Nuevo Testamento
//   vacío (los primeros aciertos se agotan en el Antiguo).
// - `total` dice cuántos resultados hay de verdad; antes se cortaba a 100 en
//   silencio y no había forma de ver el resto.
// - `bookOrder` es el orden canónico de la versión (lo sabe la pantalla, no el
//   servicio): sirve para el filtro por testamento y para devolver los
//   resultados en orden bíblico, que no es el orden de las claves del JSON.
export const SEARCH_PAGE = 50;

export interface BibleSearchPage {
  results: BibleSearchResult[];
  total: number;
  offset: number;
}

export async function searchBible(
  token: string,
  q: string,
  version = DEFAULT_VERSION,
  opts: {
    testament?: 'ot' | 'nt';
    book?: string;
    offset?: number;
    bookOrder?: string[];
  } = {}
): Promise<BibleSearchPage> {
  const { testament, book, offset = 0, bookOrder = [] } = opts;
  const scoped = testament === 'ot' || testament === 'nt';

  const inScope = (b: string): boolean => {
    if (book && b !== book) return false;
    if (!scoped) return true;
    const i = bookOrder.indexOf(b);
    if (i < 0) return true; // libro que no reconocemos: no lo escondemos
    return testament === 'ot' ? i < 39 : i >= 39; // Mateo (39) abre el Nuevo
  };

  const bible = await getLocalBible(version);
  if (bible) {
    // Insensible a tildes, igual que el backend: si solo se arregla allí, quien
    // tenga la Biblia descargada se queda con el defecto ("corazon" no
    // encontraría "corazón").
    const query = fold(q.trim());

    // Orden canónico: las claves del JSON no vienen en orden bíblico en todas
    // las versiones.
    const books = Object.keys(bible).sort(
      (a, b) => bookOrder.indexOf(a) - bookOrder.indexOf(b)
    );

    const results: BibleSearchResult[] = [];
    let total = 0;
    for (const b of books) {
      if (!inScope(b)) continue;
      for (const chapter of Object.keys(bible[b])) {
        for (const [verse, text] of Object.entries(bible[b][chapter])) {
          if (!fold(text).includes(query)) continue;
          total++;
          if (total > offset && results.length < SEARCH_PAGE) {
            results.push({ book: b, chapter, verse, text: text.trim() });
          }
        }
      }
    }
    return { results, total, offset };
  }

  const { data } = await api.get<BibleSearchPage>('/bible/search', {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      q,
      version,
      paged: 1,
      limit: SEARCH_PAGE,
      offset,
      ...(scoped ? { testament } : {}),
      ...(book ? { book } : {}),
    },
  });
  return data;
}

// ── Datos personales sincronizados con la cuenta ───────────
// Favoritos/resaltados/notas viven en AsyncStorage (offline) y se sincronizan
// con la cuenta para verlos en todos los dispositivos (web incluida).

export interface BibleUserData {
  favorites: any[];
  highlights: any[];
  annotations: any[];
  // Lápidas de borrado: con ellas el cliente borra de su copia local lo que se
  // eliminó en otro dispositivo, y el servidor sabe qué NO resucitar.
  deletions?: { id: string; kind: 'favorite' | 'highlight' | 'annotation'; at: string }[];
}

const authHeader = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function fetchBibleUserData(token: string): Promise<BibleUserData> {
  const { data } = await api.get<BibleUserData>('/bible/me/data', authHeader(token));
  return data;
}

// Fusiona lo local con la cuenta (importar al iniciar sesión) y devuelve lo combinado.
export async function syncBibleUserData(
  token: string,
  payload: BibleUserData
): Promise<BibleUserData> {
  const { data } = await api.post<BibleUserData>('/bible/me/sync', payload, authHeader(token));
  return data;
}

export const pushFavorite = (token: string, fav: any) =>
  api.post('/bible/me/favorites', fav, authHeader(token));
export const deleteFavoriteRemote = (token: string, id: string) =>
  api.delete(`/bible/me/favorites/${encodeURIComponent(id)}`, authHeader(token));

export const pushHighlight = (token: string, h: any) =>
  api.put('/bible/me/highlights', h, authHeader(token));
export const deleteHighlightRemote = (token: string, id: string) =>
  api.delete(`/bible/me/highlights/${encodeURIComponent(id)}`, authHeader(token));

export const pushAnnotation = (token: string, a: any) =>
  api.put('/bible/me/annotations', a, authHeader(token));
export const deleteAnnotationRemote = (token: string, id: string) =>
  api.delete(`/bible/me/annotations/${encodeURIComponent(id)}`, authHeader(token));

// ── Planes de lectura (#2) ─────────────────────────────────

const myTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export async function fetchReadingPlans(token: string): Promise<any[]> {
  const { data } = await api.get('/bible/plans', authHeader(token));
  return data;
}

export async function fetchMyReadingPlans(token: string): Promise<any[]> {
  const { data } = await api.get('/bible/me/plans', authHeader(token));
  return data;
}

export async function subscribeReadingPlan(token: string, planKey: string, extra: any = {}): Promise<any> {
  const { data } = await api.post(
    '/bible/me/plans',
    { planKey, timezone: myTimezone(), ...extra },
    authHeader(token)
  );
  return data;
}

// ─── Temas (pasajes para una ocasión: boda, cumpleaños, duelo…) ──────────────
//
// El catálogo lo define el BACKEND (`lib/bibleTopics.ts`), no el cliente: si cada
// app llevara su lista, se separarían al primer retoque. Las referencias van por
// índice de libro, así que el mismo tema sirve para las 7 versiones; el backend
// resuelve nombre y texto en la versión pedida.

export interface Topic {
  key: string;
  title: string;
  description: string;
  category: string;
  emoji: string;
  count: number;
}

export interface TopicPassage {
  book: string;
  chapter: string;
  from: string;
  to?: string;
  /** "Salmos 23:1-6" — la referencia tal y como se muestra. */
  label: string;
  verses: { verse: string; text: string }[];
}

export interface TopicDetail {
  key: string;
  title: string;
  description: string;
  category: string;
  emoji: string;
  version: string;
  passages: TopicPassage[];
}

export async function fetchTopics(): Promise<{ categories: string[]; topics: Topic[] }> {
  try {
    const { data } = await api.get('/bible/topics');
    return data;
  } catch {
    return { categories: [], topics: [] };
  }
}

export async function fetchTopicDetail(
  key: string,
  version = DEFAULT_VERSION
): Promise<TopicDetail | null> {
  try {
    const { data } = await api.get<TopicDetail>(
      `/bible/topics/${encodeURIComponent(key)}`,
      { params: { version } }
    );
    return data;
  } catch {
    return null;
  }
}

// ─── Memorizar versículos (repaso espaciado) ─────────────────────────────────
//
// Sistema de Leitner: cada acierto aleja el siguiente repaso (1, 3, 7, 16, 35
// días) y un fallo lo devuelve al principio. El backend lleva la cuenta; aquí
// solo se pide lo que toca hoy y se manda el resultado del repaso.

export interface MemorizeVerse {
  id: string;
  book: string;
  chapter: string;
  verse: string;
  text: string;
  level: number;
  dueAt: string;
  reviews: number;
  isLearned: boolean;
  isDue: boolean;
}

export async function fetchMemorize(token: string): Promise<MemorizeVerse[]> {
  try {
    const { data } = await api.get<MemorizeVerse[]>('/bible/me/memorize', authHeader(token));
    return data;
  } catch {
    return [];
  }
}

export async function addMemorize(token: string, verse: any): Promise<MemorizeVerse | null> {
  try {
    const { data } = await api.post<MemorizeVerse>('/bible/me/memorize', verse, authHeader(token));
    return data;
  } catch {
    return null;
  }
}

export async function reviewMemorize(
  token: string,
  id: string,
  correct: boolean
): Promise<MemorizeVerse | null> {
  try {
    const { data } = await api.post<MemorizeVerse>(
      `/bible/me/memorize/${encodeURIComponent(id)}/review`,
      { correct },
      authHeader(token)
    );
    return data;
  } catch {
    return null;
  }
}

export async function removeMemorize(token: string, id: string): Promise<void> {
  try {
    await api.delete(`/bible/me/memorize/${encodeURIComponent(id)}`, authHeader(token));
  } catch { /* ignora */ }
}

// ─── Racha de lectura ────────────────────────────────────────────────────────
//
// Días naturales seguidos leyendo. El día es el LOCAL del usuario (por eso se
// manda `tz`): leer a las 23:30 en Lima cuenta como hoy, no como mañana.

export interface ReadingStreak {
  current: number;
  longest: number;
  totalDays: number;
  lastDay: string;
  isTodayDone: boolean;
}

export async function fetchStreak(token: string): Promise<ReadingStreak | null> {
  try {
    const { data } = await api.get<ReadingStreak>('/bible/me/streak', {
      ...authHeader(token),
      params: { tz: myTimezone() },
    });
    return data;
  } catch {
    return null;
  }
}

/** "Hoy he leído". Idempotente: llamarlo varias veces el mismo día no suma. */
export async function markReadToday(token: string): Promise<ReadingStreak | null> {
  try {
    const { data } = await api.post<ReadingStreak>(
      '/bible/me/streak',
      { tz: myTimezone() },
      authHeader(token)
    );
    return data;
  } catch {
    return null;
  }
}

// ─── Planes de lectura en GRUPO ──────────────────────────────────────────────
//
// Un plan de grupo no es un objeto aparte: son las suscripciones de los miembros
// al mismo plan, ligadas al grupo. Cada uno lleva su progreso y su recordatorio;
// lo que comparten es la fecha de inicio, y por eso "hoy toca el día 12"
// significa lo mismo para todos. Quien se une tarde se ALINEA con el grupo (lo
// hace el backend), no empieza por el día 1.

export interface GroupPlanMember {
  userId: string;
  name: string;
  avatar: string | null;
  currentDay: number;
  completedCount: number;
  isTodayDone: boolean;
  isFinished: boolean;
}

export interface GroupPlan {
  planKey: string;
  title: string;
  description: string;
  category: string;
  totalDays: number;
  startDate: string;
  currentDay: number;
  memberCount: number;
  isJoined: boolean;
  members: GroupPlanMember[];
  // Presentes en /bible/me/group-plans (una lista mezcla varios grupos); en
  // /bible/groups/:id/plans el grupo se sabe por la ruta.
  groupId?: string;
  groupName?: string;
  isCustom?: boolean;
}

/** Los planes que lee un grupo, con el progreso de cada miembro. */
export async function fetchGroupPlans(token: string, groupId: string): Promise<GroupPlan[]> {
  try {
    const { data } = await api.get<GroupPlan[]>(`/bible/groups/${groupId}/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch {
    // Sin conexión (o ya no eres del grupo): la pantalla de planes debe seguir
    // funcionando, solo que sin la parte social.
    return [];
  }
}

/** Todos los planes que leen los grupos del usuario, aunque no se haya unido. */
export async function fetchMyGroupPlans(token: string): Promise<GroupPlan[]> {
  try {
    const { data } = await api.get<GroupPlan[]>('/bible/me/group-plans', authHeader(token));
    return data;
  } catch {
    return [];
  }
}

export async function createCustomReadingPlan(
  token: string,
  custom: any,
  groupId?: string | null
): Promise<any> {
  const { data } = await api.post(
    '/bible/me/plans',
    { custom, timezone: myTimezone(), ...(groupId ? { groupId } : {}) },
    authHeader(token)
  );
  return data;
}

// ── Fotos de fondo (Pexels vía backend) para compartir como imagen (#4 móvil) ──
export interface BackgroundPhoto {
  id: number;
  thumb: string;
  full: string;
  photographer?: string;
  alt?: string;
}

// ── Versículo del día (#8) ─────────────────────────────────
// El mismo para toda la comunidad cada día (lo decide el backend con la fecha).
// `tz` define de qué día hablamos: el día no cambia a la vez en Madrid y Lima.
export interface DailyVerse {
  date: string;
  version: string;
  versionName: string;
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

export async function fetchDailyVerse(version = DEFAULT_VERSION): Promise<DailyVerse> {
  const { data } = await api.get<DailyVerse>('/bible/daily', {
    params: { version, tz: myTimezone() },
  });
  return data;
}

// ── Versículo del día en el chat del grupo (tarjeta + reacciones compartidas) ──
export interface DailyVerseReactor {
  userId: string;
  name: string;
  avatar: string | null;
  emoji: string;
}
export interface GroupDailyVerse {
  verse: DailyVerse;
  dateKey: string;
  reactions: DailyVerseReactor[];
  myEmoji: string | null;
}

export async function fetchGroupDailyVerse(
  token: string,
  groupId: string,
  version = DEFAULT_VERSION
): Promise<GroupDailyVerse | null> {
  try {
    const { data } = await api.get<GroupDailyVerse>(`/conversations/${groupId}/daily-verse`, {
      params: { version, tz: myTimezone() },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch {
    return null;
  }
}

export async function reactGroupDailyVerse(
  token: string,
  groupId: string,
  emoji: string
): Promise<{ reactions: DailyVerseReactor[]; myEmoji: string | null } | null> {
  try {
    const { data } = await api.post(
      `/conversations/${groupId}/daily-verse/react`,
      { emoji, tz: myTimezone() },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data;
  } catch {
    return null;
  }
}

// El endpoint /public/photos es público (no requiere token).
export async function searchBackgroundPhotos(q = '', page = 1): Promise<BackgroundPhoto[]> {
  const { data } = await api.get('/public/photos', { params: { q, page } });
  return data?.photos || [];
}

export async function updateReadingPlan(token: string, key: string, body: any): Promise<any> {
  const { data } = await api.patch(
    `/bible/me/plans/${encodeURIComponent(key)}`,
    { timezone: myTimezone(), ...body },
    authHeader(token)
  );
  return data;
}

export async function toggleReadingPlanDay(token: string, key: string, day: number): Promise<any> {
  const { data } = await api.post(
    `/bible/me/plans/${encodeURIComponent(key)}/toggle-day`,
    { day },
    authHeader(token)
  );
  return data;
}

export async function unsubscribeReadingPlan(token: string, key: string): Promise<any> {
  const { data } = await api.delete(`/bible/me/plans/${encodeURIComponent(key)}`, authHeader(token));
  return data;
}

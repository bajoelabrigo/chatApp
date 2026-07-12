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
  lang: 'es' | 'en';
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

export async function createCustomReadingPlan(token: string, custom: any): Promise<any> {
  const { data } = await api.post(
    '/bible/me/plans',
    { custom, timezone: myTimezone() },
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

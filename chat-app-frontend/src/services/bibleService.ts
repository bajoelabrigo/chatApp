import * as FileSystem from 'expo-file-system/legacy';
import type { DownloadResumable } from 'expo-file-system/legacy';
import api from './authService';

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

export async function fetchBooks(token: string, version = 'RVR1960'): Promise<string[]> {
  const bible = await getLocalBible(version);
  if (bible) return Object.keys(bible);
  const { data } = await api.get<string[]>('/bible/books', {
    headers: { Authorization: `Bearer ${token}` },
    params: { version },
  });
  return data;
}

export async function fetchChapters(token: string, book: string, version = 'RVR1960'): Promise<string[]> {
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
  version = 'RVR1960'
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

export async function searchBible(
  token: string,
  q: string,
  version = 'RVR1960'
): Promise<BibleSearchResult[]> {
  const bible = await getLocalBible(version);
  if (bible) {
    const query = q.trim().toLowerCase();
    const results: BibleSearchResult[] = [];
    outer: for (const book of Object.keys(bible)) {
      for (const chapter of Object.keys(bible[book])) {
        for (const [verse, text] of Object.entries(bible[book][chapter])) {
          if (text.toLowerCase().includes(query)) {
            results.push({ book, chapter, verse, text: text.trim() });
            if (results.length >= 100) break outer;
          }
        }
      }
    }
    return results;
  }
  const { data } = await api.get<BibleSearchResult[]>('/bible/search', {
    headers: { Authorization: `Bearer ${token}` },
    params: { q, version },
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

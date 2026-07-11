import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchBibleUserData,
  syncBibleUserData,
  pushFavorite,
  deleteFavoriteRemote,
  pushHighlight,
  deleteHighlightRemote,
  pushAnnotation,
  deleteAnnotationRemote,
} from '../services/bibleService';

export interface BibleFavorite {
  id: string;   // "{book}:{chapter}:{verse}"
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

export interface BibleHighlight {
  id: string;   // "{book}:{chapter}:{verse}"
  book: string;
  chapter: string;
  verse: string;
  color: string; // hex
  updatedAt?: string;
}

export interface BibleAnnotation {
  id: string;   // "{book}:{chapter}:{verse}"
  book: string;
  chapter: string;
  verse: string;
  note: string;
  updatedAt: string;
}

const FAV_KEY        = 'bible_favorites';
const HIGHLIGHT_KEY  = 'bible_highlights';
const ANNOTATION_KEY = 'bible_annotations';
const FONT_SIZE_KEY  = 'bible_font_size';
const VERSION_KEY    = 'bible_selected_version';
const LAST_READ_KEY  = 'bible_last_read';
const DEFAULT_FONT_SIZE = 17;

export interface BibleLastRead {
  version: string;
  book: string;
  chapter: string;
}

interface BibleStoreState {
  favorites: BibleFavorite[];
  highlights: BibleHighlight[];
  annotations: BibleAnnotation[];
  fontSize: number;

  authToken: string | null;
  syncWithServer: (token: string) => Promise<void>;

  loadFavorites: () => Promise<void>;
  addFavorite: (fav: BibleFavorite) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  isFavorite: (id: string) => boolean;

  loadHighlights: () => Promise<void>;
  setHighlight: (h: BibleHighlight) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
  getHighlight: (id: string) => BibleHighlight | undefined;

  loadAnnotations: () => Promise<void>;
  saveAnnotation: (a: Omit<BibleAnnotation, 'updatedAt'> & { note: string }) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  getAnnotation: (id: string) => BibleAnnotation | undefined;

  loadFontSize: () => Promise<void>;
  setFontSize: (n: number) => Promise<void>;

  selectedVersion: string;
  loadSelectedVersion: () => Promise<void>;
  setSelectedVersion: (v: string) => Promise<void>;

  lastRead: BibleLastRead | null;
  loadLastRead: () => Promise<void>;
  setLastRead: (r: BibleLastRead) => Promise<void>;
  clearLastRead: () => Promise<void>;
}

export const useBibleStore = create<BibleStoreState>((set, get) => ({
  favorites: [],
  highlights: [],
  annotations: [],
  fontSize: DEFAULT_FONT_SIZE,
  selectedVersion: 'RVR1960',
  authToken: null,

  // ── Sync con la cuenta ─────────────────────────────────
  // Llamar al enfocar la pantalla de Biblia con el token de sesión. Importa lo
  // local a la cuenta (merge) la primera vez y trae lo de otros dispositivos.
  // Best-effort: si falla (sin red/sesión), se sigue usando lo local.
  syncWithServer: async (token) => {
    set({ authToken: token });
    try {
      // Leemos lo local directo de AsyncStorage (no del estado, que puede no
      // haberse cargado aún) para no perder nada al importar.
      const parse = (v: string | null) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
      const [rf, rh, ra] = await Promise.all([
        AsyncStorage.getItem(FAV_KEY),
        AsyncStorage.getItem(HIGHLIGHT_KEY),
        AsyncStorage.getItem(ANNOTATION_KEY),
      ]);
      const local = { favorites: parse(rf), highlights: parse(rh), annotations: parse(ra) };
      const hasLocal = local.favorites.length || local.highlights.length || local.annotations.length;

      const data = hasLocal
        ? await syncBibleUserData(token, local)
        : await fetchBibleUserData(token);

      const favorites = data.favorites || [];
      const highlights = data.highlights || [];
      const annotations = data.annotations || [];
      set({ favorites, highlights, annotations });
      await Promise.all([
        AsyncStorage.setItem(FAV_KEY, JSON.stringify(favorites)),
        AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(highlights)),
        AsyncStorage.setItem(ANNOTATION_KEY, JSON.stringify(annotations)),
      ]);
    } catch {
      // sin sesión válida / sin red → seguimos en local
    }
  },

  // ── Favorites ──────────────────────────────────────────

  loadFavorites: async () => {
    try {
      const raw = await AsyncStorage.getItem(FAV_KEY);
      set({ favorites: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ favorites: [] });
    }
  },

  addFavorite: async (fav) => {
    const current = get().favorites;
    if (current.some((f) => f.id === fav.id)) return;
    const updated = [fav, ...current];
    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) pushFavorite(t, fav).catch(() => {});
  },

  removeFavorite: async (id) => {
    const updated = get().favorites.filter((f) => f.id !== id);
    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) deleteFavoriteRemote(t, id).catch(() => {});
  },

  isFavorite: (id) => get().favorites.some((f) => f.id === id),

  // ── Highlights ─────────────────────────────────────────

  loadHighlights: async () => {
    try {
      const raw = await AsyncStorage.getItem(HIGHLIGHT_KEY);
      set({ highlights: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ highlights: [] });
    }
  },

  setHighlight: async (h) => {
    const entry = { ...h, updatedAt: new Date().toISOString() } as BibleHighlight & { updatedAt: string };
    const current = get().highlights.filter((x) => x.id !== h.id);
    const updated = [...current, entry];
    set({ highlights: updated });
    await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) pushHighlight(t, entry).catch(() => {});
  },

  removeHighlight: async (id) => {
    const updated = get().highlights.filter((h) => h.id !== id);
    set({ highlights: updated });
    await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) deleteHighlightRemote(t, id).catch(() => {});
  },

  getHighlight: (id) => get().highlights.find((h) => h.id === id),

  // ── Annotations ────────────────────────────────────────

  loadAnnotations: async () => {
    try {
      const raw = await AsyncStorage.getItem(ANNOTATION_KEY);
      set({ annotations: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ annotations: [] });
    }
  },

  saveAnnotation: async ({ id, book, chapter, verse, note }) => {
    const entry: BibleAnnotation = { id, book, chapter, verse, note, updatedAt: new Date().toISOString() };
    const current = get().annotations.filter((a) => a.id !== id);
    const updated = [entry, ...current];
    set({ annotations: updated });
    await AsyncStorage.setItem(ANNOTATION_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) pushAnnotation(t, entry).catch(() => {});
  },

  deleteAnnotation: async (id) => {
    const updated = get().annotations.filter((a) => a.id !== id);
    set({ annotations: updated });
    await AsyncStorage.setItem(ANNOTATION_KEY, JSON.stringify(updated));
    const t = get().authToken;
    if (t) deleteAnnotationRemote(t, id).catch(() => {});
  },

  getAnnotation: (id) => get().annotations.find((a) => a.id === id),

  // ── Font size ──────────────────────────────────────────

  loadFontSize: async () => {
    try {
      const raw = await AsyncStorage.getItem(FONT_SIZE_KEY);
      if (raw) set({ fontSize: Number(raw) });
    } catch {}
  },

  setFontSize: async (n) => {
    const clamped = Math.min(26, Math.max(13, n));
    set({ fontSize: clamped });
    await AsyncStorage.setItem(FONT_SIZE_KEY, String(clamped));
  },

  // ── Selected version ───────────────────────────────────

  loadSelectedVersion: async () => {
    try {
      const raw = await AsyncStorage.getItem(VERSION_KEY);
      if (raw) set({ selectedVersion: raw });
    } catch {}
  },

  setSelectedVersion: async (v) => {
    set({ selectedVersion: v });
    await AsyncStorage.setItem(VERSION_KEY, v);
  },

  // ── Continuar leyendo (#3) ─────────────────────────────
  lastRead: null,

  loadLastRead: async () => {
    try {
      const raw = await AsyncStorage.getItem(LAST_READ_KEY);
      if (raw) set({ lastRead: JSON.parse(raw) });
    } catch {}
  },

  setLastRead: async (r) => {
    set({ lastRead: r });
    try {
      await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(r));
    } catch {}
  },

  clearLastRead: async () => {
    set({ lastRead: null });
    try {
      await AsyncStorage.removeItem(LAST_READ_KEY);
    } catch {}
  },
}));

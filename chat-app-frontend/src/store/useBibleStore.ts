import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
const DEFAULT_FONT_SIZE = 17;

interface BibleStoreState {
  favorites: BibleFavorite[];
  highlights: BibleHighlight[];
  annotations: BibleAnnotation[];
  fontSize: number;

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
}

export const useBibleStore = create<BibleStoreState>((set, get) => ({
  favorites: [],
  highlights: [],
  annotations: [],
  fontSize: DEFAULT_FONT_SIZE,
  selectedVersion: 'RVR1960',

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
  },

  removeFavorite: async (id) => {
    const updated = get().favorites.filter((f) => f.id !== id);
    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
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
    const current = get().highlights.filter((x) => x.id !== h.id);
    const updated = [...current, h];
    set({ highlights: updated });
    await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(updated));
  },

  removeHighlight: async (id) => {
    const updated = get().highlights.filter((h) => h.id !== id);
    set({ highlights: updated });
    await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(updated));
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
  },

  deleteAnnotation: async (id) => {
    const updated = get().annotations.filter((a) => a.id !== id);
    set({ annotations: updated });
    await AsyncStorage.setItem(ANNOTATION_KEY, JSON.stringify(updated));
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
}));

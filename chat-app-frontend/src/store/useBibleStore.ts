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
  safeVersion,
  DEFAULT_VERSION,
} from '../services/bibleService';

export interface BibleFavorite {
  id: string;   // "{book}:{chapter}:{verse}"
  book: string;
  chapter: string;
  verse: string;
  text: string;
  // Etiquetas del versículo ("Promesa", "Mandato"…). Viven en el favorito porque
  // la clave es la misma: etiquetar un versículo lo guarda en favoritos.
  tags?: string[];
}

// Sugerencias por defecto (el usuario puede crear las suyas). Espejo del
// TAG_PRESETS de la web.
export const TAG_PRESETS = [
  'Promesa',
  'Mandato',
  'Oración',
  'Consuelo',
  'Enseñanza',
  'Gratitud',
];

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
const DELETION_KEY   = 'bible_deletions';

// ── Lápidas de borrado (tombstones) ─────────────────────────
// El merge del servidor era una UNIÓN: si borrabas un favorito aquí y luego
// sincronizaba la web —que aún tenía su copia local— el favorito RESUCITABA.
// Ahora cada borrado deja una lápida con su fecha; se manda al sincronizar y el
// servidor descarta el item salvo que se haya vuelto a crear después.
type BibleItemKind = 'favorite' | 'highlight' | 'annotation';
interface BibleDeletion { id: string; kind: BibleItemKind; at: string }

async function getDeletions(): Promise<BibleDeletion[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function recordDeletion(kind: BibleItemKind, id: string) {
  const list = (await getDeletions()).filter((d) => !(d.kind === kind && d.id === id));
  list.push({ kind, id, at: new Date().toISOString() });
  await AsyncStorage.setItem(DELETION_KEY, JSON.stringify(list));
}

// Volver a crear algo entierra su lápida: si no, el servidor lo seguiría
// descartando por considerarlo borrado.
async function clearDeletion(kind: BibleItemKind, id: string) {
  const list = (await getDeletions()).filter((d) => !(d.kind === kind && d.id === id));
  await AsyncStorage.setItem(DELETION_KEY, JSON.stringify(list));
}
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
  setVerseTags: (verse: BibleFavorite, tags: string[]) => Promise<void>;
  getVerseTags: (id: string) => string[];
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
  selectedVersion: DEFAULT_VERSION,
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
      // Las lápidas viajan con el lote: así el servidor descarta lo que se borró
      // aquí en vez de devolvérnoslo (antes el merge era una unión y lo resucitaba).
      const deletions = await getDeletions();
      const local = {
        favorites: parse(rf),
        highlights: parse(rh),
        annotations: parse(ra),
        deletions,
      };
      const hasLocal =
        local.favorites.length ||
        local.highlights.length ||
        local.annotations.length ||
        deletions.length;

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
        // Las lápidas combinadas (ya sin las caducadas) sustituyen a las locales.
        AsyncStorage.setItem(DELETION_KEY, JSON.stringify(data.deletions || [])),
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
    const entry = { ...fav, updatedAt: new Date().toISOString() };
    const updated = [entry, ...current];
    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
    await clearDeletion('favorite', fav.id); // volver a guardarlo entierra su lápida
    const t = get().authToken;
    if (t) pushFavorite(t, entry).catch(() => {});
  },

  // Etiquetas del versículo: si no estaba en favoritos, se añade (la etiqueta
  // vive en el favorito). Con la lista vacía se limpian, pero el favorito se
  // mantiene: quitar etiquetas no es desguardar.
  setVerseTags: async (verse, tags) => {
    const current = get().favorites;
    const i = current.findIndex((f) => f.id === verse.id);
    const entry: BibleFavorite = i >= 0 ? { ...current[i], tags } : { ...verse, tags };
    const updated = i >= 0 ? current.map((f, k) => (k === i ? entry : f)) : [entry, ...current];

    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
    await clearDeletion('favorite', verse.id); // etiquetar reactiva el favorito
    const t = get().authToken;
    if (t) pushFavorite(t, { ...entry, updatedAt: new Date().toISOString() } as any).catch(() => {});
  },

  getVerseTags: (id) => get().favorites.find((f) => f.id === id)?.tags ?? [],

  removeFavorite: async (id) => {
    const updated = get().favorites.filter((f) => f.id !== id);
    set({ favorites: updated });
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(updated));
    await recordDeletion('favorite', id); // lápida: que no resucite al sincronizar
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
    await clearDeletion('highlight', h.id);
    const t = get().authToken;
    if (t) pushHighlight(t, entry).catch(() => {});
  },

  removeHighlight: async (id) => {
    const updated = get().highlights.filter((h) => h.id !== id);
    set({ highlights: updated });
    await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(updated));
    await recordDeletion('highlight', id);
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
    await clearDeletion('annotation', id);
    const t = get().authToken;
    if (t) pushAnnotation(t, entry).catch(() => {});
  },

  deleteAnnotation: async (id) => {
    const updated = get().annotations.filter((a) => a.id !== id);
    set({ annotations: updated });
    await AsyncStorage.setItem(ANNOTATION_KEY, JSON.stringify(updated));
    await recordDeletion('annotation', id);
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

  // Migra a quien tuviera guardada una versión retirada (RVR1960): sin esto,
  // seguiría pidiéndola al backend en cada arranque.
  loadSelectedVersion: async () => {
    try {
      const raw = await AsyncStorage.getItem(VERSION_KEY);
      const v = safeVersion(raw);
      set({ selectedVersion: v });
      if (raw && raw !== v) await AsyncStorage.setItem(VERSION_KEY, v);
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
      if (!raw) return;
      const r = JSON.parse(raw);
      // La última lectura puede apuntar a una versión retirada (y a un libro con
      // nombre de esa versión, p.ej. "S.Juan"): descartarla es más limpio que
      // reabrir un pasaje que ya no existe.
      if (r?.version && safeVersion(r.version) !== r.version) {
        await AsyncStorage.removeItem(LAST_READ_KEY);
        return;
      }
      set({ lastRead: r });
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

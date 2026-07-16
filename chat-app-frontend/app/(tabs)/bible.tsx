import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Share,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { createPrayerRequest, togglePray } from '../../src/services/activityService';
import { getPrayerFeed as getPrayerFeedApi } from '../../src/services/dailyPopupService';
import type { PrayerFeed } from '../../src/services/dailyPopupService';
import { uploadFile } from '../../src/services/uploadService';
import { useBibleStore } from '../../src/store/useBibleStore';
import type { BibleFavorite } from '../../src/store/useBibleStore';
import {
  fetchVersions,
  fetchBooks,
  fetchChapters,
  fetchVerses,
  searchBible,
  isBibleDownloaded,
  downloadBible,
  deleteBibleDownload,
  cancelBibleDownload,
  purgeRetiredBibles,
  fetchDailyVerse,
  searchBackgroundPhotos,
  fetchReadingPlans,
  fetchMyReadingPlans,
  subscribeReadingPlan,
  createCustomReadingPlan,
  updateReadingPlan,
  toggleReadingPlanDay,
  unsubscribeReadingPlan,
  fetchGroupPlans,
  fetchMyGroupPlans,
  fetchMemorize,
  addMemorize,
  reviewMemorize,
  removeMemorize,
  fetchStreak,
  markReadToday,
} from '../../src/services/bibleService';
import type {
  BibleVerse,
  BibleSearchResult,
  BibleVersion,
  DailyVerse,
  MemorizeVerse,
  ReadingStreak,
} from '../../src/services/bibleService';
import { getSettingsApi, updateSettingsApi } from '../../src/services/userService';
import VerseImageSheet from '../../src/components/bible/VerseImageSheet';
import { useSpeech } from '../../src/hooks/useSpeech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseReference, formatReference } from '../../src/utils/bibleRef';
import { highlightParts, fold } from '../../src/utils/textFold';
import { HIGHLIGHT_PALETTE, meaningOf } from '../../src/utils/highlightPalette';
import type { BibleRef } from '../../src/utils/bibleRef';

import {
  HIGHLIGHT_COLORS,
  SEARCH_HISTORY_KEY,
  READING_THEME_KEY,
  READING_FONT_KEY,
  SEPIA_BG,
  SEPIA_TEXT,
  MIN_FONT,
  MAX_FONT,
  VERSION_META,
  VERSION_IDS,
  CANONICAL_ORDER_RVA,
  CANONICAL_ORDER_EN,
  getCanonicalOrder,
  formatForShare,
} from '../../src/constants/bible';
import type { ScreenView, BookOrder, VerseItem } from '../../src/constants/bible';
import { DailyVerseCard } from '../../src/components/bible/DailyVerseCard';
import { PrayerFeedCard } from '../../src/components/bible/PrayerFeedCard';
import { ContinueReadingCard } from '../../src/components/bible/ContinueReadingCard';
import { GroupPlanCard } from '../../src/components/bible/GroupPlanCard';
import { DownloadBanner } from '../../src/components/bible/DownloadBanner';
import { VerseTagsModal } from '../../src/components/bible/VerseTagsModal';
import { CrossRefsModal } from '../../src/components/bible/CrossRefsModal';
import type { CrossRef } from '../../src/services/bibleService';
import { PrayerRequestModal } from '../../src/components/bible/PrayerRequestModal';
import type { PrayerSubmission } from '../../src/components/bible/PrayerRequestModal';
import { ReadingSettingsMenu } from '../../src/components/bible/ReadingSettingsMenu';
import { VersionPickerModal, ComparePickerModal } from '../../src/components/bible/VersionPickerModal';
import { ReadingPlansView } from '../../src/components/bible/ReadingPlansView';
import { GroupPlanPickerModal } from '../../src/components/bible/GroupPlanPickerModal';
import { MemorizeView } from '../../src/components/bible/MemorizeView';
import { TopicsView } from '../../src/components/bible/TopicsView';
import { VerseActionsSheet } from '../../src/components/bible/VerseActionsSheet';
import { SendToChatModal } from '../../src/components/bible/SendToChatModal';
import { getSocket } from '../../src/services/socketService';
import type { SharedBible, Conversation } from '../../src/services/conversationService';
import { BookChapterPicker } from '../../src/components/bible/BookChapterPicker';
import { CreatePlanModal } from '../../src/components/bible/CreatePlanModal';
import type { CustomPlanDraft } from '../../src/components/bible/CreatePlanModal';

export default function BibleScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuthStore();

  // Entrada desde otro tab: /(tabs)/bible?section=plans (lo usa el botón del plan
  // de lectura en el chat del grupo). Sin esto, el botón dejaría al usuario en la
  // portada de la Biblia, buscando dónde está el plan.
  //
  // El `useRef` evita reabrir la sección si el usuario vuelve al tab sin cambiar
  // el parámetro (mismo patrón que en settings.tsx).
  const { section: sectionParam, groupId: groupIdParam, openRef: openRefParam, refVersion: refVersionParam } = useLocalSearchParams<{
    section?: string;
    groupId?: string;
    openRef?: string;
    refVersion?: string;
  }>();
  const handledSection = useRef<string | null>(null);
  // Pasaje a abrir desde un mensaje bíblico del chat ("Abrir en la Biblia").
  const handledRef = useRef<string | null>(null);
  const pendingRef = useRef<{ book: string; chapter: number; verse: number; version: string } | null>(null);
  // Grupos del usuario: las peticiones de oración cuelgan de un grupo.
  const conversations = useChatsStore((s) => s.conversations);
  const {
    favorites, highlights, annotations, fontSize, selectedVersion,
    loadFavorites, loadHighlights, loadAnnotations, loadFontSize, loadSelectedVersion,
    addFavorite, removeFavorite, isFavorite,
    setHighlight, removeHighlight, getHighlight,
    saveAnnotation, deleteAnnotation, getAnnotation,
    setFontSize, setSelectedVersion, syncWithServer,
    lastRead, loadLastRead, setLastRead, clearLastRead,
    setVerseTags, getVerseTags,
  } = useBibleStore();

  const [view, setView] = useState<ScreenView>('books');
  const [prevView, setPrevView] = useState<ScreenView>('books');
  const [bookOrder, setBookOrder] = useState<BookOrder>('traditional');
  const [books, setBooks] = useState<string[]>([]);
  const [chapters, setChapters] = useState<string[]>([]);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [searchResults, setSearchResults] = useState<BibleSearchResult[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedVerses, setSelectedVerses] = useState<Map<string, VerseItem>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlightTarget, setHighlightTarget] = useState<VerseItem | null>(null);
  const [imageVerse, setImageVerse] = useState<VerseItem | null>(null);

  // Download state — keyed by version
  const [downloadedVersions, setDownloadedVersions] = useState<Set<string>>(new Set());
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Version picker
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<BibleVersion[]>([]);

  // Lectura en voz alta (#6). `available` es false en los APKs que aún no traen
  // el módulo nativo expo-speech → allí no se muestra el botón (ver useSpeech).
  const speech = useSpeech();

  // Vista paralela (#5): segunda versión en la columna derecha (null = apagada)
  const [compareVersion, setCompareVersion] = useState<string | null>(null);
  const [compareVerses, setCompareVerses] = useState<BibleVerse[]>([]);
  const [comparePickerOpen, setComparePickerOpen] = useState(false);

  // Annotation modal state
  const [annotationTarget, setAnnotationTarget] = useState<VerseItem | null>(null);
  const [annotationText, setAnnotationText] = useState('');

  // Dots menu
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false);

  // Planes de lectura (#2)
  const [myPlans, setMyPlans] = useState<any[]>([]);
  const [planCatalog, setPlanCatalog] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  // Planes que leen mis grupos (aunque no me haya unido) → sección "Planes de los
  // miembros de {grupo}". Es lo que hace que el botón del chat ("N de M leyeron
  // hoy") lleve a algo: sin esto, un plan que empieza un compañero es invisible.
  const [groupPlansDiscover, setGroupPlansDiscover] = useState<any[]>([]);
  // Grupo desde el que se llegó (botón del chat): sus planes se muestran primero.
  const [highlightGroupId, setHighlightGroupId] = useState<string | null>(null);

  // Crear mi plan (#D)
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);

  // Versículo del día (#8): el mismo para toda la comunidad cada día. La foto de
  // fondo es opcional (si el backend no tiene clave de Pexels, queda el color).
  const [daily, setDaily] = useState<DailyVerse | null>(null);
  const [dailyPhoto, setDailyPhoto] = useState<string | null>(null);
  // null = aún no sabemos si tiene el aviso diario activo → no se pinta la campana.
  const [dailyReminder, setDailyReminder] = useState<boolean | null>(null);

  // Fotos de fondo de las otras dos tarjetas de la portada (grupo y continuar
  // leyendo). Se piden una sola vez; si no hay clave de Pexels o no hay red, se
  // quedan en null y las tarjetas usan su color de fondo.
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  const [continuePhoto, setContinuePhoto] = useState<string | null>(null);

  // Petición de oración del Explorar: una al azar de mis grupos (la elige el
  // backend). Sin grupos o sin peticiones abiertas → null y no se pinta.
  const [prayerFeed, setPrayerFeed] = useState<PrayerFeed | null>(null);
  const [prayerFeedDone, setPrayerFeedDone] = useState(false);

  const loadPrayerFeed = async () => {
    if (!token) return;
    try {
      const feed = await getPrayerFeedApi(token);
      setPrayerFeed(feed);
      setPrayerFeedDone(false);
    } catch {
      setPrayerFeed(null);
    }
  };

  const prayForFeed = async () => {
    if (!token || !prayerFeed || prayerFeedDone) return;
    setPrayerFeedDone(true); // optimista: el botón responde al instante
    try {
      await togglePray(token, prayerFeed.groupId, prayerFeed._id);
    } catch {
      setPrayerFeedDone(false);
    }
  };

  // Temas de lectura (backlog de pulido): sepia y tipografía con serifa.
  const [readingTheme, setReadingTheme] = useState<'default' | 'sepia'>('default');
  const [readingFont, setReadingFont] = useState<'sans' | 'serif'>('sans');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(READING_THEME_KEY),
      AsyncStorage.getItem(READING_FONT_KEY),
    ])
      .then(([t, f]) => {
        if (t === 'sepia') setReadingTheme('sepia');
        if (f === 'serif') setReadingFont('serif');
      })
      .catch(() => {});
  }, []);

  const changeReadingTheme = (t: 'default' | 'sepia') => {
    setReadingTheme(t);
    AsyncStorage.setItem(READING_THEME_KEY, t).catch(() => {});
  };
  const changeReadingFont = (f: 'sans' | 'serif') => {
    setReadingFont(f);
    AsyncStorage.setItem(READING_FONT_KEY, f).catch(() => {});
  };

  const isSepia = readingTheme === 'sepia';
  const readBg = isSepia ? SEPIA_BG : colors.bgPrimary;
  const readText = isSepia ? SEPIA_TEXT : colors.textPrimary;
  // La serifa del sistema: "serif" existe en Android e iOS.
  const readFontFamily = readingFont === 'serif' ? (Platform.OS === 'ios' ? 'Georgia' : 'serif') : undefined;

  // Etiquetas del versículo (backlog de pulido). Se guardan en el favorito, así
  // que etiquetar un versículo lo añade a Favoritos.
  const [tagsVerse, setTagsVerse] = useState<VerseItem | null>(null);
  const [tagFilter, setTagFilter] = useState('');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites) for (const t of f.tags ?? []) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [favorites]);

  const visibleFavorites = useMemo(
    () => (tagFilter ? favorites.filter((f) => (f.tags ?? []).includes(tagFilter)) : favorites),
    [favorites, tagFilter]
  );

  const openTagsModal = (v: VerseItem) => {
    setTagsVerse(v);
    setSelectedVerses(new Map());
  };

  const saveTags = async (tags: string[]) => {
    if (!tagsVerse) return;
    const v = tagsVerse;
    await setVerseTags(
      { id: `${v.book}:${v.chapter}:${v.verse}`, book: v.book, chapter: v.chapter, verse: v.verse, text: v.text },
      tags
    );
    setTagsVerse(null);
  };

  // Referencias cruzadas: los pasajes que hablan de lo mismo que el versículo
  // seleccionado. El dataset vive en el servidor, así que el modal las pide al
  // abrirse (y se degrada a un aviso si no hay conexión).
  const [xrefVerse, setXrefVerse] = useState<VerseItem | null>(null);

  // Tocar una referencia navega al pasaje. Reutiliza `goToReference`, que ya
  // acota capítulos inexistentes y resalta el versículo al llegar.
  const openCrossRef = (ref: CrossRef) => {
    // Con la nueva arquitectura el setter puede vaciar el state de forma síncrona
    // antes de que termine el handler: se captura el destino ANTES de cerrar.
    const target = { book: ref.book, chapter: ref.chapter, verse: ref.verse };
    setXrefVerse(null);
    setSelectedVerses(new Map());
    goToReference(target);
  };

  // Pedir oración por un versículo (backlog de pulido). En el móvil las
  // peticiones cuelgan de un GRUPO, así que hay que elegir uno de los del
  // usuario; el versículo se adjunta al final del texto que escriba.
  // El formulario entero vive en PrayerRequestModal: aquí solo se sube la foto
  // (si la hay) y se llama a la API.
  const [prayerVerse, setPrayerVerse] = useState<VerseItem | null>(null);

  const myGroups = useMemo(
    () => conversations.filter((c) => c.isGroup),
    [conversations]
  );

  const openPrayerModal = (v: VerseItem) => {
    setPrayerVerse(v);
    setSelectedVerses(new Map());
  };

  const submitPrayer = async (data: PrayerSubmission) => {
    if (!token || !prayerVerse) return;
    const v = prayerVerse;
    const content = `${data.text}\n\n“${v.text}”\n— ${v.book} ${v.chapter}:${v.verse}`;

    try {
      let imageUrl: string | undefined;
      let cloudinaryPublicId: string | undefined;
      if (data.image) {
        const ext = data.image.uri.split('.').pop() ?? 'jpg';
        const mimeType = data.image.mimeType ?? `image/${ext}`;
        const up = await uploadFile(token, data.image.uri, mimeType, `prayer_${Date.now()}.${ext}`);
        imageUrl = up.url;
        cloudinaryPublicId = up.publicId;
      }

      await createPrayerRequest(
        token,
        data.groupId,
        content,
        data.isAnonymous,
        imageUrl,
        cloudinaryPublicId,
        data.deadline,
        data.shareToFeed
      );
      setPrayerVerse(null);
      Alert.alert('Petición publicada', 'Tu grupo ya puede orar contigo.');
    } catch {
      Alert.alert('Error', 'No se pudo publicar la petición.');
    }
  };

  // Mis notas y resaltados: sub-pestaña, filtro por color y búsqueda en notas.
  const [notesTab, setNotesTab] = useState<'highlights' | 'notes'>('highlights');
  const [colorFilter, setColorFilter] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const [verseTexts, setVerseTexts] = useState<Record<string, string>>({});

  // Buscar mejor (pulido): filtro por testamento/libro, historial y paginación.
  const [testament, setTestament] = useState<'all' | 'ot' | 'nt'>('all');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchTotal, setSearchTotal] = useState(0); // cuántos hay de verdad
  const [searchBook, setSearchBook] = useState('');  // '' = toda la Biblia
  const [bookPickerOpen, setBookPickerOpen] = useState(false);

  // Ir a referencia (#7): el versículo al que se acaba de saltar. Se resalta un
  // momento y la lista se desplaza hasta él.
  const [flashVerse, setFlashVerse] = useState<string | null>(null);
  const versesRef = useRef<FlatList<BibleVerse>>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      loadHighlights();
      loadAnnotations();
      loadFontSize();
      loadSelectedVersion();
      loadLastRead();
      // Sincroniza favoritos/resaltados/notas con la cuenta (merge). Best-effort.
      if (token) syncWithServer(token);
      if (books.length === 0) doLoadBooks();
      checkAllDownloads();
      loadDailyVerse();
      loadPrayerFeed();
      AsyncStorage.getItem(SEARCH_HISTORY_KEY)
        .then((raw) => { if (raw) setSearchHistory(JSON.parse(raw)); })
        .catch(() => {});
      if (availableVersions.length === 0 && token) {
        fetchVersions(token).then(setAvailableVersions).catch(() => {});
      }
    }, [])
  );

  // ── Versículo del día (#8) ──────────────────────────────────
  // Consultas de fondo por día de la semana, para que la tarjeta no enseñe
  // siempre la misma foto. Sin clave de Pexels el backend responde 503 y la
  // tarjeta se queda con su color de fondo.
  const PHOTO_QUERIES = [
    'sunrise sky', 'mountains fog', 'calm sea', 'forest light',
    'desert dunes', 'clouds sunset', 'starry night',
  ];

  const loadDailyVerse = async () => {
    try {
      const v = await fetchDailyVerse(selectedVersion);
      setDaily(v);

      const dow = new Date(v.date).getUTCDay();
      searchBackgroundPhotos(PHOTO_QUERIES[dow], 1)
        .then((photos) => {
          if (!photos.length) return;
          // Estable durante todo el día: la elige la fecha, no el azar.
          const n = Number(v.date.replace(/-/g, '')) % photos.length;
          setDailyPhoto(photos[n].full);
        })
        .catch(() => {});
    } catch {
      // sin red y sin caché: la tarjeta simplemente no aparece
    }

    // La zona horaria del usuario, para que su push salga a SUS 8:00.
    if (token) {
      updateSettingsApi(token, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        .catch(() => {});
      getSettingsApi(token)
        .then((s) => setDailyReminder(s.notificationSettings?.dailyVerse !== false))
        .catch(() => {});
    }
  };

  const toggleDailyReminder = async () => {
    if (!token) return;
    const next = !dailyReminder;
    setDailyReminder(next); // optimista: el interruptor responde al instante
    try {
      await updateSettingsApi(token, { notificationSettings: { dailyVerse: next } });
    } catch {
      setDailyReminder(!next);
      Alert.alert('Error', 'No se pudo cambiar el aviso diario.');
    }
  };

  const checkAllDownloads = async () => {
    // Antes de mirar qué hay descargado, borra del dispositivo las versiones
    // retiradas (RVR1960): si no, quien la tuviera guardada la seguiría leyendo.
    await purgeRetiredBibles();
    const ids = VERSION_IDS;
    const results = await Promise.all(ids.map((id) => isBibleDownloaded(id)));
    const downloaded = new Set<string>();
    ids.forEach((id, i) => { if (results[i]) downloaded.add(id); });
    setDownloadedVersions(downloaded);
  };

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim();
    if (q.length < 3) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(() => doSearch(q), 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery]);

  const doLoadBooks = async (version = selectedVersion) => {
    if (!token) return;
    setLoading(true);
    try { setBooks(await fetchBooks(token, version)); }
    finally { setLoading(false); }
  };

  // Elegir libro desde el selector de arriba: carga los capítulos y se queda donde
  // está, para que el botón "Cap." se encienda y el usuario elija sin salir de la
  // pantalla (es el comportamiento de los desplegables de la web).
  //
  // Antes había además un `selectBook` para la lista de los 66 libros que se
  // pintaba bajo las tarjetas; esa lista se quitó (el selector la sustituye, y
  // encima tiene buscador), así que la función se fue con ella.
  const selectBookInline = async (book: string) => {
    if (!token) return;
    setSelectedBook(book);
    setSelectedChapter(null);
    setLoading(true);
    try {
      setChapters(await fetchChapters(token, book, selectedVersion));
    } finally {
      setLoading(false);
    }
  };

  const selectChapter = async (chapter: string) => {
    if (!token || !selectedBook) return;
    setSelectedChapter(chapter);
    setSelectedVerses(new Map());
    setLoading(true);
    try {
      setVerses(await fetchVerses(token, selectedBook, chapter, selectedVersion));
      setView('reading');
      setLastRead({ version: selectedVersion, book: selectedBook, chapter });
      registerReadToday();
    }
    finally { setLoading(false); }
  };

  // La búsqueda pagina (50 en 50) y dice cuántos resultados hay en total; antes
  // se cortaba a 100 en silencio. `offset > 0` = "cargar más".
  const doSearch = async (
    q: string,
    scope: 'all' | 'ot' | 'nt' = testament,
    onlyBook = searchBook,
    offset = 0
  ) => {
    if (!token) return;
    setLoading(true);
    try {
      const page = await searchBible(token, q, selectedVersion, {
        testament: scope === 'all' ? undefined : scope,
        book: onlyBook || undefined,
        offset,
        bookOrder: getCanonicalOrder(selectedVersion),
      });
      setSearchResults((prev) => (offset > 0 ? [...prev, ...page.results] : page.results));
      setSearchTotal(page.total);
      pushSearchHistory(q);
    }
    finally { setLoading(false); }
  };

  // Cambiar de ámbito (testamento o libro) REPITE la búsqueda con él, no filtra
  // lo ya encontrado: como se pagina, lo que falta puede no estar cargado aún.
  const changeTestament = (scope: 'all' | 'ot' | 'nt') => {
    setTestament(scope);
    const q = searchQuery.trim();
    if (q.length >= 3) doSearch(q, scope, searchBook, 0);
  };

  const changeSearchBook = (b: string) => {
    setSearchBook(b);
    setBookPickerOpen(false);
    const q = searchQuery.trim();
    if (q.length >= 3) doSearch(q, testament, b, 0);
  };

  // ── Buscar mejor (pulido) ───────────────────────────────────
  // Historial (últimas 8 búsquedas) y filtro por testamento. El resaltado del
  // término va en renderVerseRow.
  const pushSearchHistory = async (q: string) => {
    const term = q.trim();
    if (term.length < 3) return;
    const next = [term, ...searchHistory.filter((h) => h !== term)].slice(0, 8);
    setSearchHistory(next);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  };

  const clearSearchHistory = async () => {
    setSearchHistory([]);
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  };


  // ─── Vista paralela (#5) ──────────────────────────────────
  // Cada versión nombra los libros a su manera ("S.Juan" en RVR1960 → "John" en
  // KJV), así que el libro se traduce por posición canónica antes de pedirlo.
  const mapBookToVersion = (book: string, from: string, to: string): string | null => {
    const i = getCanonicalOrder(from).indexOf(book);
    return i >= 0 ? getCanonicalOrder(to)[i] ?? null : null;
  };

  // Carga el capítulo equivalente en la versión de comparación. Usa el mismo
  // fetchVerses, así que también funciona sin conexión si está descargada.
  useEffect(() => {
    if (!token || !compareVersion || !selectedBook || !selectedChapter) {
      setCompareVerses([]);
      return;
    }
    const target = mapBookToVersion(selectedBook, selectedVersion, compareVersion);
    if (!target) { setCompareVerses([]); return; }

    let cancelled = false;
    fetchVerses(token, target, selectedChapter, compareVersion)
      .then((v) => { if (!cancelled) setCompareVerses(v); })
      .catch(() => { if (!cancelled) setCompareVerses([]); });
    return () => { cancelled = true; };
  }, [token, compareVersion, selectedBook, selectedChapter, selectedVersion]);

  // ─── Lectura en voz alta (#6) ─────────────────────────────
  // Lo que se lee: el capítulo entero, versículo a versículo, anteponiendo el
  // número ("1. En el principio…") para no perderse al escuchar.
  const speechItems = useMemo(
    () => verses.map((v) => ({ id: v.verse, text: `${v.verse}. ${v.text}` })),
    [verses]
  );

  const speechLang = VERSION_META[selectedVersion]?.lang ?? 'es';

  // Cambiar de capítulo/libro/versión o salir de la lectura corta la voz: si no,
  // seguiría leyendo el capítulo anterior.
  useEffect(() => {
    speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook, selectedChapter, selectedVersion, view]);

  // Filas de la vista paralela: los versículos de la versión principal más los
  // que solo existan en la de comparación (la numeración puede diferir), en
  // orden numérico.
  const compareRows = useMemo(() => {
    const rows = new Map<string, { verse: string; left?: string; right?: string }>();
    for (const v of verses) rows.set(v.verse, { verse: v.verse, left: v.text });
    for (const v of compareVerses) {
      rows.set(v.verse, { ...(rows.get(v.verse) ?? { verse: v.verse }), verse: v.verse, right: v.text });
    }
    return [...rows.values()].sort((a, b) => Number(a.verse) - Number(b.verse));
  }, [verses, compareVerses]);

  const navigateChapter = async (dir: 'prev' | 'next') => {
    if (!selectedChapter) return;
    const idx = chapters.indexOf(selectedChapter);
    const next = dir === 'prev' ? idx - 1 : idx + 1;
    if (next >= 0 && next < chapters.length) await selectChapter(chapters[next]);
  };

  // ── Ir a referencia (#7) ────────────────────────────────────
  // El mismo cuadro de búsqueda entiende referencias: si lo escrito ("Juan
  // 3:16", "1 co 13", "sal 23") apunta a un libro de la versión activa, se
  // ofrece el salto directo encima de los resultados por palabra.
  const refMatch = useMemo(() => {
    if (view !== 'search' || !books.length) return null;

    // 1. Contra los libros de la versión activa (el nombre ya sirve tal cual).
    const direct = parseReference(searchQuery, books);
    if (direct) return direct;

    // 2. Contra los nombres de la otra lengua: quien lee la KJV sigue pudiendo
    //    escribir "Juan 3:16", y quien lee la RVA, "John 3:16". El libro se
    //    traduce a la versión activa por posición canónica.
    const otherOrder =
      VERSION_META[selectedVersion]?.lang === 'en' ? CANONICAL_ORDER_RVA : CANONICAL_ORDER_EN;
    const cross = parseReference(searchQuery, otherOrder);
    if (!cross) return null;

    const name = getCanonicalOrder(selectedVersion)[otherOrder.indexOf(cross.book)];
    return name && books.includes(name) ? { ...cross, book: name } : null;
  }, [view, searchQuery, books, selectedVersion]);

  const goToReference = async (ref: BibleRef) => {
    if (!token) return;
    setSelectedBook(ref.book);
    setLoading(true);
    try {
      const chs = await fetchChapters(token, ref.book, selectedVersion);
      setChapters(chs);

      // Sin capítulo ("Génesis") se abre la lista de capítulos del libro.
      if (!ref.chapter) { setSelectedChapter(null); setView('chapters'); return; }

      // Un capítulo que no existe (Salmos 200) se acota al último del libro en
      // vez de fallar: el usuario ya dijo a qué libro quiere ir.
      const chapter = chs.includes(ref.chapter) ? ref.chapter : chs[chs.length - 1];

      const vs = await fetchVerses(token, ref.book, chapter, selectedVersion);
      setSelectedChapter(chapter);
      setSelectedVerses(new Map());
      setVerses(vs);
      setView('reading');
      setLastRead({ version: selectedVersion, book: ref.book, chapter });
      registerReadToday();

      const target = ref.verse && vs.some((v) => v.verse === ref.verse) ? ref.verse : null;
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashVerse(target);
      if (target) flashTimer.current = setTimeout(() => setFlashVerse(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  // Desplaza hasta el versículo al que se saltó, una vez pintada la lista.
  useEffect(() => {
    if (view !== 'reading' || !flashVerse || compareVersion) return;
    const index = verses.findIndex((v) => v.verse === flashVerse);
    if (index < 0) return;
    const t = setTimeout(
      () => versesRef.current?.scrollToIndex({ index, viewPosition: 0.25, animated: true }),
      120
    );
    return () => clearTimeout(t);
  }, [view, flashVerse, verses, compareVersion]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Fotos de las tarjetas de la portada. Van aparte del versículo del día porque
  // no dependen de la fecha: se piden una vez y punto. Si fallan (sin red, sin
  // clave de Pexels), las tarjetas se quedan con su color de fondo.
  useEffect(() => {
    searchBackgroundPhotos('friends together bible study', 1)
      .then((p) => p.length && setGroupPhoto(p[0].full))
      .catch(() => {});
    searchBackgroundPhotos('open book candle', 1)
      .then((p) => p.length && setContinuePhoto(p[0].full))
      .catch(() => {});
  }, []);

  // Racha y versículos a memorizar, al entrar.
  //
  // La racha solo se PINTA aquí; marcarla es cosa de leer un capítulo, no de
  // abrir la pestaña. Y la lista de memorización se carga aunque no se abra su
  // vista, porque el menú muestra cuántos repasos tocan hoy: sin esto el
  // contador saldría siempre a cero y nadie descubriría la función.
  useEffect(() => {
    if (!token) return;
    fetchStreak(token).then((s) => { if (s) setStreak(s); });
    fetchMemorize(token).then(setMemorizeList);
    // Los planes también, aunque no se abra la pestaña: la tarjeta de la portada
    // necesita saber si ya lees uno con un grupo (y por dónde va el grupo).
    loadPlans();
  }, [token]);


  const openTopics = () => { setPrevView(view); setView('topics'); };
  const openSearch = () => { setPrevView(view); setView('search'); setSearchQuery(''); setSearchResults([]); };
  const openFavorites = () => { setPrevView(view); setView('favorites'); };
  const openNotes = () => { setPrevView(view); setView('notes'); };

  // ── Mis notas y resaltados ──────────────────────────────────
  // Los resaltados y las notas guardan la REFERENCIA, no el texto del versículo,
  // así que para listarlos hay que traerlo. Se piden los capítulos únicos que
  // salen en la lista (suelen ser pocos) y se cachean en memoria.
  const notesItems = useMemo(() => {
    if (notesTab === 'highlights') {
      const list = colorFilter ? highlights.filter((h) => h.color === colorFilter) : highlights;
      return [...list].sort(
        (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
      );
    }
    const q = fold(noteQuery.trim());
    const list = q ? annotations.filter((a) => fold(a.note ?? '').includes(q)) : annotations;
    return [...list].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );
  }, [notesTab, highlights, annotations, colorFilter, noteQuery]);

  useEffect(() => {
    if (view !== 'notes' || !token || notesItems.length === 0) return;

    // Traduce el libro a la versión actual (los resaltados viejos pueden tener el
    // nombre de otra versión) y agrupa por capítulo para pedir cada uno una vez.
    const order = getCanonicalOrder(selectedVersion);
    const pending = new Map<string, { book: string; chapter: string; raw: string }>();
    for (const it of notesItems) {
      if (verseTexts[`${it.book}:${it.chapter}:${it.verse}`] !== undefined) continue;
      const book = books.includes(it.book) ? it.book : order[order.indexOf(it.book)] ?? it.book;
      pending.set(`${book}:${it.chapter}`, { book, chapter: it.chapter, raw: it.book });
    }
    if (!pending.size) return;

    let cancelled = false;
    Promise.all(
      [...pending.values()].map(async ({ book, chapter, raw }) => {
        try {
          const vs = await fetchVerses(token, book, chapter, selectedVersion);
          // Se indexa con el nombre GUARDADO, que es con el que se busca luego.
          return vs.map((v) => [`${raw}:${chapter}:${v.verse}`, v.text] as [string, string]);
        } catch {
          return [] as [string, string][];
        }
      })
    ).then((chunks) => {
      if (cancelled) return;
      setVerseTexts((prev) => ({ ...prev, ...Object.fromEntries(chunks.flat()) }));
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, notesItems, token, selectedVersion, books]);

  // Al cambiar de versión el texto cacheado ya no vale.
  useEffect(() => setVerseTexts({}), [selectedVersion]);

  // ── Planes de lectura (#2) ──────────────────────────────────
  const loadPlans = async () => {
    if (!token) return;
    setPlansLoading(true);
    try {
      const [cat, mine, groupPlans] = await Promise.all([
        fetchReadingPlans(token).catch(() => []),
        fetchMyReadingPlans(token).catch(() => []),
        fetchMyGroupPlans(token).catch(() => []),
      ]);
      setPlanCatalog(cat);
      setMyPlans(mine);
      setGroupPlansDiscover(groupPlans);
      // El progreso de los miembros va aparte (se pide por grupo) y no debe
      // retrasar el pintado de los planes: se lanza sin esperarlo.
      loadGroupProgress(mine);
    } finally {
      setPlansLoading(false);
    }
  };

  const openPlans = () => { setPrevView(view); setView('plans'); loadPlans(); };

  // Llegada desde el chat del grupo (?section=plans&groupId=...): abre directamente
  // los planes y, si viene groupId, coloca los de ESE grupo primero — así el botón
  // "N de M leyeron hoy" aterriza justo en el plan del que venía.
  useEffect(() => {
    if (!sectionParam || sectionParam === handledSection.current) return;
    handledSection.current = sectionParam;
    setHighlightGroupId(typeof groupIdParam === 'string' ? groupIdParam : null);
    if (sectionParam === 'plans') openPlans();
    else if (sectionParam === 'topics') openTopics();
  }, [sectionParam, groupIdParam]);

  // Abrir un pasaje compartido desde el chat ("Abrir en la Biblia"). El libro va
  // nombrado en la versión con la que se compartió, así que se cambia a esa
  // versión ANTES de saltar (si no, "John" no existiría en la RVA). Como cambiar
  // de versión es asíncrono (re-render), se guarda el pasaje pendiente y se abre
  // cuando la versión ya coincide.
  const openPendingRef = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setView('books');
    // BibleRef usa strings para capítulo/versículo (así los pide el backend).
    goToReference({ book: p.book, chapter: String(p.chapter), verse: String(p.verse) });
  }, [goToReference]);

  useEffect(() => {
    if (!openRefParam || openRefParam === handledRef.current) return;
    handledRef.current = openRefParam;
    const [book, ch, vs] = String(openRefParam).split('|');
    if (!book) return;
    const version = typeof refVersionParam === 'string' && refVersionParam ? refVersionParam : selectedVersion;
    pendingRef.current = { book, chapter: Number(ch), verse: Number(vs), version };
    if (version !== selectedVersion) setSelectedVersion(version);
    else openPendingRef();
  }, [openRefParam, refVersionParam]);

  // Cuando la versión ya es la del pasaje pendiente, abre.
  useEffect(() => {
    const p = pendingRef.current;
    if (p && p.version === selectedVersion) openPendingRef();
  }, [selectedVersion, openPendingRef]);

  // El formulario vive en CreatePlanModal; aquí solo se valida el rango y se
  // llama a la API.
  const submitCustomPlan = async (draft: CustomPlanDraft, groupId: string | null) => {
    if (!token) return;
    if (draft.bookEnd < draft.bookStart) {
      Alert.alert('Revisa el rango', 'El libro final debe ir después (o igual) del inicial.');
      return;
    }
    setCreatingPlan(true);
    try {
      const sub = await createCustomReadingPlan(token, draft, groupId);
      setMyPlans((prev) => [...prev, sub]);
      // Si es un plan de grupo, el resto del grupo debe poder verlo y unirse.
      if (groupId) {
        await loadGroupProgress([...myPlans, sub]);
        fetchMyGroupPlans(token).then(setGroupPlansDiscover).catch(() => {});
      }
      setCreatePlanOpen(false);
    } catch {
      Alert.alert('Error', 'No se pudo crear el plan.');
    } finally {
      setCreatingPlan(false);
    }
  };

  // ── Memorizar versículos + racha de lectura ─────────────────
  const [memorizeList, setMemorizeList] = useState<MemorizeVerse[]>([]);
  const [memorizeLoading, setMemorizeLoading] = useState(false);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);

  const openMemorize = async () => {
    setPrevView(view);
    setView('memorize');
    if (!token) return;
    setMemorizeLoading(true);
    try {
      setMemorizeList(await fetchMemorize(token));
    } finally {
      setMemorizeLoading(false);
    }
  };

  const handleMemorizeAdd = async (v: VerseItem) => {
    if (!token) return;
    const added = await addMemorize(token, {
      book: v.book,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
    });
    if (added) {
      setMemorizeList((prev) => [added, ...prev.filter((m) => m.id !== added.id)]);
      Alert.alert('Añadido', `${v.book} ${v.chapter}:${v.verse} está en tus versículos para memorizar.`);
    } else {
      Alert.alert('Error', 'No se pudo añadir el versículo.');
    }
  };

  const handleMemorizeReview = async (v: MemorizeVerse, correct: boolean) => {
    if (!token) return;
    // Optimista: la tarjeta debe pasar YA, no cuando responda el servidor.
    setMemorizeList((prev) =>
      prev.map((m) => (m.id === v.id ? { ...m, isDue: false } : m))
    );
    const updated = await reviewMemorize(token, v.id, correct);
    if (updated) {
      setMemorizeList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
  };

  const handleMemorizeRemove = async (v: MemorizeVerse) => {
    if (!token) return;
    setMemorizeList((prev) => prev.filter((m) => m.id !== v.id));
    await removeMemorize(token, v.id);
  };

  // La racha se marca al LEER un capítulo (no al abrir la app): la recompensa
  // tiene que corresponderse con el hábito, o deja de significar nada. Es
  // idempotente, así que leer diez capítulos hoy sigue contando como un día.
  const registerReadToday = async () => {
    if (!token) return;
    const s = await markReadToday(token);
    if (s) setStreak(s);
  };

  // ── Planes en grupo ─────────────────────────────────────────
  //
  // El progreso de los miembros no viene con `myPlans` (esos son MIS
  // suscripciones): se pide por grupo. Como un usuario suele leer con cero o un
  // grupo, se piden solo los grupos que aparecen en sus planes.
  const [groupProgress, setGroupProgress] = useState<
    Record<string, { groupName: string; members: any[] }>
  >({});

  const loadGroupProgress = async (plans: any[]) => {
    if (!token) return;
    const groupIds = [...new Set(plans.map((p) => p.groupId).filter(Boolean))] as string[];
    if (!groupIds.length) { setGroupProgress({}); return; }

    const byPlan: Record<string, { groupName: string; members: any[] }> = {};
    await Promise.all(
      groupIds.map(async (gid) => {
        const groupName =
          conversations.find((c) => c._id === gid)?.groupName ?? 'Mi grupo';
        for (const gp of await fetchGroupPlans(token, gid)) {
          byPlan[gp.planKey] = { groupName, members: gp.members };
        }
      })
    );
    setGroupProgress(byPlan);
  };

  // El plan que el usuario lee CON un grupo, listo para la tarjeta de la portada.
  // Solo uno: si leyera varios en grupo se muestra el primero — apilar tarjetas en
  // la portada la convertiría en una lista, y para eso ya está la pestaña.
  const activeGroupPlan = useMemo(() => {
    const p = myPlans.find((x) => x.groupId && groupProgress[x.planKey]);
    if (!p) return null;
    const g = groupProgress[p.planKey];
    return {
      title: p.title,
      currentDay: p.currentDay,
      totalDays: p.totalDays,
      completedCount: p.completedCount,
      groupName: g.groupName,
      members: g.members,
    };
  }, [myPlans, groupProgress]);

  // Empezar un plan: primero se pregunta con quién (por mi cuenta o con un grupo).
  // El plan pendiente de elección vive aquí; el modal solo devuelve el grupo.
  const [planToStart, setPlanToStart] = useState<any | null>(null);

  const startPlan = (planKey: string) => {
    const plan = planCatalog.find((p) => p.key === planKey);
    setPlanToStart(plan ?? { key: planKey, title: 'Plan de lectura' });
  };

  const confirmStartPlan = async (groupId: string | null) => {
    // Nueva arquitectura: el setter puede vaciar el state de forma síncrona antes
    // de que acabe el handler, así que se captura ANTES de cerrar el modal.
    const plan = planToStart;
    setPlanToStart(null);
    if (!token || !plan) return;

    const planKey = plan.key;
    setPlanBusy(planKey);
    try {
      const sub = await subscribeReadingPlan(token, planKey, groupId ? { groupId } : {});
      const next = [...myPlans.filter((p) => p.planKey !== planKey), sub];
      setMyPlans(next);
      if (groupId) await loadGroupProgress(next);
    } catch {
      Alert.alert('Error', 'No se pudo empezar el plan.');
    } finally {
      setPlanBusy(null);
    }
  };

  // Unirse a un plan que ya lee un grupo (desde la sección "Planes de los
  // miembros de {grupo}"). El backend hereda la fecha de inicio del grupo, así que
  // caigo en el mismo día que los demás — y, si es personalizado, hereda también
  // su definición.
  // Iniciar una lectura EN VIVO con el grupo sobre la lectura de hoy del plan.
  const startGroupReadingFromPlan = (plan: any) => {
    const r = plan.today?.references?.[0];
    if (!r || !plan.groupId) return;
    const book = getCanonicalOrder(selectedVersion)[r.book];
    if (!book) return;
    router.push({
      pathname: '/live-reading/[id]',
      params: { id: plan.groupId, host: '1', book, chapter: String(r.startChapter), version: selectedVersion },
    } as any);
  };

  const joinGroupPlan = async (planKey: string, groupId: string) => {
    if (!token) return;
    setPlanBusy(planKey);
    try {
      const sub = await subscribeReadingPlan(token, planKey, { groupId });
      const next = [...myPlans.filter((p) => p.planKey !== planKey), sub];
      setMyPlans(next);
      await loadGroupProgress(next);
      // Ya aparezco como miembro → se cae de "descubrir".
      fetchMyGroupPlans(token).then(setGroupPlansDiscover).catch(() => {});
      Alert.alert('¡Te uniste!', 'Ya lees este plan con tu grupo.');
    } catch {
      Alert.alert('Error', 'No se pudo unirte al plan.');
    } finally {
      setPlanBusy(null);
    }
  };

  // Planes de mis grupos a los que aún NO me he unido (los que ya sigo salen en
  // "Mis planes"). Si llegué desde un grupo concreto, los suyos van primero.
  const discoverGroupPlans = useMemo(() => {
    const list = groupPlansDiscover.filter((g) => !g.isJoined);
    if (!highlightGroupId) return list;
    return [...list].sort(
      (a, b) =>
        (b.groupId === highlightGroupId ? 1 : 0) - (a.groupId === highlightGroupId ? 1 : 0)
    );
  }, [groupPlansDiscover, highlightGroupId]);

  const togglePlanDay = async (plan: any) => {
    if (!token) return;
    setPlanBusy(plan.planKey);
    try {
      const updated = await toggleReadingPlanDay(token, plan.planKey, plan.currentDay);
      setMyPlans((prev) => prev.map((p) => (p.planKey === plan.planKey ? updated : p)));
    } catch { /* ignora */ }
    finally { setPlanBusy(null); }
  };

  const togglePlanReminder = async (plan: any) => {
    if (!token) return;
    try {
      const updated = await updateReadingPlan(token, plan.planKey, { reminderEnabled: !plan.reminderEnabled });
      setMyPlans((prev) => prev.map((p) => (p.planKey === plan.planKey ? updated : p)));
    } catch { /* ignora */ }
  };

  // Menú del botón de recordatorio: permite activarlo o eliminarlo.
  const reminderMenu = (plan: any) => {
    const hhmm = `${String(plan.reminderHour).padStart(2, '0')}:${String(plan.reminderMinute).padStart(2, '0')}`;
    Alert.alert(
      'Recordatorio diario',
      plan.reminderEnabled
        ? `Aviso de lectura activo a las ${hhmm}.`
        : 'No tienes un recordatorio para este plan.',
      plan.reminderEnabled
        ? [
            { text: 'Eliminar recordatorio', style: 'destructive', onPress: () => togglePlanReminder(plan) },
            { text: 'Cancelar', style: 'cancel' },
          ]
        : [
            { text: 'Activar recordatorio', onPress: () => togglePlanReminder(plan) },
            { text: 'Cancelar', style: 'cancel' },
          ]
    );
  };

  const abandonPlan = async (planKey: string) => {
    if (!token) return;
    try {
      await unsubscribeReadingPlan(token, planKey);
      setMyPlans((prev) => prev.filter((p) => p.planKey !== planKey));
    } catch { /* ignora */ }
  };

  const restartPlan = (plan: any) => {
    if (!token) return;
    Alert.alert(
      'Volver a empezar',
      '¿Empezar este plan de nuevo desde hoy? Se borrará tu progreso.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: async () => {
            setPlanBusy(plan.planKey);
            try {
              const updated = await updateReadingPlan(token, plan.planKey, {
                startDate: new Date().toISOString(),
                resetProgress: true,
              });
              setMyPlans((prev) => prev.map((p) => (p.planKey === plan.planKey ? updated : p)));
            } catch { /* ignora */ }
            finally { setPlanBusy(null); }
          },
        },
      ]
    );
  };

  const openPlanPassage = async (bookIndex: number, chapter: number) => {
    if (!token) return;
    const name = getCanonicalOrder(selectedVersion)[bookIndex];
    if (!name) return;
    setSelectedBook(name);
    setLoading(true);
    try {
      setChapters(await fetchChapters(token, name, selectedVersion));
      setSelectedChapter(String(chapter));
      setSelectedVerses(new Map());
      setVerses(await fetchVerses(token, name, String(chapter), selectedVersion));
      setView('reading');
      setLastRead({ version: selectedVersion, book: name, chapter: String(chapter) });
      registerReadToday();
    } finally {
      setLoading(false);
    }
  };

  // ── Continuar leyendo (#3) ──────────────────────────────────
  const resumeReading = async () => {
    if (!lastRead || !token) return;
    if (lastRead.version !== selectedVersion) await setSelectedVersion(lastRead.version);
    setSelectedBook(lastRead.book);
    setLoading(true);
    try {
      setChapters(await fetchChapters(token, lastRead.book, lastRead.version));
      setSelectedChapter(lastRead.chapter);
      setSelectedVerses(new Map());
      setVerses(await fetchVerses(token, lastRead.book, lastRead.chapter, lastRead.version));
      setView('reading');
      registerReadToday();
    } finally {
      setLoading(false);
    }
  };

  // Vistas "de sección" (no forman parte del recorrido libro → capítulo →
  // lectura): se sale de ellas volviendo a de donde se vino, y si se vino de otra
  // sección, a la lista de libros. Estaba escrito dos veces a mano y ya iban
  // cinco; con la lista aquí, añadir una sección nueva es una línea.
  const isSection = (v: ScreenView) =>
    v === 'search' ||
    v === 'favorites' ||
    v === 'notes' ||
    v === 'plans' ||
    v === 'memorize' ||
    v === 'topics';

  const goBack = () => {
    if (view === 'reading') setView('chapters');
    else if (view === 'chapters') setView('books');
    else if (isSection(view)) setView(isSection(prevView) ? 'books' : prevView);
  };

  const toggleVerse = (v: VerseItem) => {
    const key = `${v.book}:${v.chapter}:${v.verse}`;
    setSelectedVerses((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key); else next.set(key, v);
      return next;
    });
  };

  const applyHighlight = async (color: string) => {
    const targets = highlightTarget ? [highlightTarget] : Array.from(selectedVerses.values());
    for (const v of targets) {
      const id = `${v.book}:${v.chapter}:${v.verse}`;
      await setHighlight({ id, book: v.book, chapter: v.chapter, verse: v.verse, color });
    }
    setHighlightTarget(null);
    setSelectedVerses(new Map());
  };

  const clearHighlight = async () => {
    const targets = highlightTarget ? [highlightTarget] : Array.from(selectedVerses.values());
    for (const v of targets) await removeHighlight(`${v.book}:${v.chapter}:${v.verse}`);
    setHighlightTarget(null);
    setSelectedVerses(new Map());
  };

  const handleFavoriteToggle = async () => {
    for (const [key, v] of selectedVerses) {
      if (isFavorite(key)) await removeFavorite(key);
      else await addFavorite({ id: key, ...v });
    }
    setSelectedVerses(new Map());
  };

  const handleShare = async () => {
    const list = Array.from(selectedVerses.values());
    if (!list.length) return;
    const vName = VERSION_META[selectedVersion]?.name ?? selectedVersion;
    await Share.share({ message: formatForShare(list, vName, selectedVersion) });
    setSelectedVerses(new Map());
  };

  // ── Enviar el pasaje a un chat (tarjeta `bible`) ────────────
  // "Juan 3:16" / "Juan 3:16-18" para un rango del mismo capítulo / el primero +
  // cuántos más si abarca varios.
  const [sendChatPassage, setSendChatPassage] = useState<SharedBible | null>(null);
  // Elegir grupo para leer EN VIVO el capítulo actual.
  const [liveReadPickerOpen, setLiveReadPickerOpen] = useState(false);

  const startGroupReadingFromBible = (conv: Conversation) => {
    setLiveReadPickerOpen(false);
    if (!selectedBook || !selectedChapter) return;
    router.push({
      pathname: '/live-reading/[id]',
      params: { id: conv._id, host: '1', book: selectedBook, chapter: selectedChapter, version: selectedVersion },
    } as any);
  };

  const buildBibleReference = (list: VerseItem[]): string => {
    const first = list[0];
    if (list.length === 1) return `${first.book} ${first.chapter}:${first.verse}`;
    const last = list[list.length - 1];
    const sameBookCh = list.every(
      (v) => v.book === first.book && String(v.chapter) === String(first.chapter)
    );
    if (sameBookCh) return `${first.book} ${first.chapter}:${first.verse}-${last.verse}`;
    return `${first.book} ${first.chapter}:${first.verse} (+${list.length - 1})`;
  };

  const handleSendToChat = () => {
    const list = Array.from(selectedVerses.values())
      .slice()
      .sort((a, b) => Number(a.chapter) - Number(b.chapter) || Number(a.verse) - Number(b.verse));
    if (!list.length) return;
    const first = list[0];
    setSendChatPassage({
      reference: buildBibleReference(list),
      version: selectedVersion,
      versionName: VERSION_META[selectedVersion]?.name ?? selectedVersion,
      book: first.book,
      chapter: Number(first.chapter),
      verse: Number(first.verse),
      verses: list.map((v) => ({
        book: v.book,
        chapter: Number(v.chapter),
        verse: Number(v.verse),
        text: v.text,
      })),
    });
    setSelectedVerses(new Map());
  };

  const sendPassageToConversation = (conv: Conversation) => {
    const passage = sendChatPassage;
    setSendChatPassage(null);
    const socket = getSocket();
    if (!passage || !socket) {
      Alert.alert('Sin conexión', 'No se pudo enviar. Abre el chat e intenta de nuevo.');
      return;
    }
    socket.emit('message:send', {
      conversationId: conv._id,
      content: passage.reference,
      type: 'bible',
      bible: passage,
    });
    Alert.alert('Enviado', `Pasaje enviado a ${conv.isGroup ? conv.groupName ?? 'el grupo' : 'el chat'}.`);
  };

  const openAnnotation = (v: VerseItem) => {
    const id = `${v.book}:${v.chapter}:${v.verse}`;
    const existing = getAnnotation(id);
    setAnnotationText(existing?.note ?? '');
    setAnnotationTarget(v);
  };

  const handleSaveAnnotation = async () => {
    if (!annotationTarget) return;
    const id = `${annotationTarget.book}:${annotationTarget.chapter}:${annotationTarget.verse}`;
    if (annotationText.trim()) {
      await saveAnnotation({ id, ...annotationTarget, note: annotationText.trim() });
    } else {
      await deleteAnnotation(id);
    }
    setAnnotationTarget(null);
    setAnnotationText('');
    setSelectedVerses(new Map());
  };

  const handleDeleteAnnotation = async () => {
    if (!annotationTarget) return;
    const id = `${annotationTarget.book}:${annotationTarget.chapter}:${annotationTarget.verse}`;
    await deleteAnnotation(id);
    setAnnotationTarget(null);
    setAnnotationText('');
    setSelectedVerses(new Map());
  };

  const handleDownload = async (version: string) => {
    if (!token || downloadingVersion) return;
    setDownloadingVersion(version);
    setDownloadProgress(0);
    try {
      await downloadBible(token, version, setDownloadProgress);
      setDownloadedVersions((prev) => new Set([...prev, version]));
    } catch {
      // cancelled or network error — ignore silently
    } finally {
      setDownloadingVersion(null);
      setDownloadProgress(0);
    }
  };

  const handleCancelDownload = () => {
    cancelBibleDownload();
    setDownloadingVersion(null);
    setDownloadProgress(0);
  };

  const handleDeleteDownload = async (version: string) => {
    await deleteBibleDownload(version);
    setDownloadedVersions((prev) => { const n = new Set(prev); n.delete(version); return n; });
  };

  const handleSelectVersion = async (version: string) => {
    if (version === selectedVersion) { setVersionPickerOpen(false); return; }
    await setSelectedVersion(version);
    setVersionPickerOpen(false);
    // No tiene sentido comparar una versión consigo misma.
    if (version === compareVersion) setCompareVersion(null);
    // Reset navigation to books list with new version
    setView('books');
    setSelectedBook(null);
    setSelectedChapter(null);
    setBooks([]);
    setChapters([]);
    setVerses([]);
    setSelectedVerses(new Map());
    doLoadBooks(version);
  };

  // ─── Derived ──────────────────────────────────────────────
  const sortedBooks = useMemo(() => {
    const locale = (VERSION_META[selectedVersion]?.lang === 'en') ? 'en' : 'es';
    if (bookOrder === 'alphabetical') {
      return [...books].sort((a, b) => a.localeCompare(b, locale));
    }
    const order = getCanonicalOrder(selectedVersion);
    return [...books].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, locale);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [books, bookOrder, selectedVersion]);

  const chapterIdx = selectedChapter ? chapters.indexOf(selectedChapter) : -1;
  const selectedCount = selectedVerses.size;
  const selectedKeys = Array.from(selectedVerses.keys());
  const allFav = selectedCount > 0 && selectedKeys.every((k) => isFavorite(k));
  const anyHighlighted = selectedCount > 0 && selectedKeys.some((k) => !!getHighlight(k));
  const firstSelected = selectedCount === 1 ? Array.from(selectedVerses.values())[0] : null;

  // ─── Header ───────────────────────────────────────────────
  const iconBtn = { width: 36, height: 36, justifyContent: 'center' as const, alignItems: 'center' as const };

  const renderHeader = () => {
    if (view === 'search') return renderSearchHeader();

    const vShort = VERSION_META[selectedVersion]?.short ?? selectedVersion;
    let title = `Biblia ${vShort}`;
    if (view === 'chapters') title = selectedBook ?? '';
    if (view === 'reading') title = `${selectedBook} ${selectedChapter}`;
    if (view === 'favorites') title = 'Favoritos';
    if (view === 'notes') title = 'Notas y resaltados';
    if (view === 'plans') title = 'Planes de lectura';
    if (view === 'memorize') title = 'Memorizar';
    if (view === 'topics') title = 'Temas';
    const showBack = view !== 'books';

    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: insets.top + 4, paddingBottom: 12,
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        {showBack ? (
          <TouchableOpacity onPress={goBack} style={iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={iconBtn} />
        )}

        <View style={{ flex: 1, alignItems: 'center' }}>
          {view === 'books' ? (
            <TouchableOpacity
              onPress={() => setVersionPickerOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: 18, backgroundColor: colors.bgTertiary,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{VERSION_META[selectedVersion]?.short ?? selectedVersion}</Text>
              <Ionicons name="chevron-down" size={13} color={colors.accent} />
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {title}
            </Text>
          )}
          {downloadedVersions.has(selectedVersion) && view === 'books' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
              <Ionicons name="cloud-offline-outline" size={11} color="#22c55e" />
              <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '600' }}>Disponible sin conexión</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>

          {/* Escuchar el capítulo (#6). Oculto si el APK no trae expo-speech. */}
          {view === 'reading' && speech.available && (
            <TouchableOpacity
              onPress={() =>
                speech.speaking
                  ? speech.stop()
                  : speech.play(speechItems, { lang: speechLang })
              }
              style={iconBtn}
            >
              <Ionicons
                name={speech.speaking ? 'stop-circle' : 'volume-high-outline'}
                size={22}
                color={speech.speaking ? colors.accent : colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Leer este capítulo EN VIVO con un grupo (si el usuario tiene grupos). */}
          {view === 'reading' && myGroups.length > 0 && (
            <TouchableOpacity onPress={() => setLiveReadPickerOpen(true)} style={iconBtn}>
              <Ionicons name="people-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Vista paralela (#5): solo tiene sentido leyendo un capítulo. */}
          {view === 'reading' && (
            <TouchableOpacity onPress={() => setComparePickerOpen(true)} style={iconBtn}>
              <Ionicons
                name="git-compare-outline"
                size={22}
                color={compareVersion ? colors.accent : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          {view !== 'favorites' && view !== 'plans' && (
            <TouchableOpacity onPress={openSearch} style={iconBtn}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {(view === 'books' || view === 'reading') && (
            <TouchableOpacity onPress={() => setDotsMenuOpen(true)} style={iconBtn}>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderSearchHeader = () => (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingTop: insets.top + 4, paddingBottom: 12,
      backgroundColor: colors.bgSecondary,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <TouchableOpacity onPress={goBack} style={iconBtn}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{
        flex: 1, flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.inputBg, borderRadius: 22,
        paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border,
      }}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          autoFocus
          style={{ flex: 1, color: colors.inputText, fontSize: 15, paddingVertical: 9, paddingHorizontal: 8 }}
          placeholder="Buscar o ir a Juan 3:16"
          placeholderTextColor={colors.inputPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ─── Chapter navigation bar ────────────────────────────────

  const renderChapterNav = () => {
    if (view !== 'reading' || selectedCount > 0) return null;
    const hasPrev = chapterIdx > 0;
    const hasNext = chapterIdx < chapters.length - 1;
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        paddingBottom: insets.bottom + 12,
        backgroundColor: colors.bgSecondary,
        borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        <TouchableOpacity
          onPress={() => navigateChapter('prev')} disabled={!hasPrev}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: hasPrev ? 1 : 0.3 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 14 }}>
            {hasPrev ? `Cap. ${chapters[chapterIdx - 1]}` : ''}
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {chapterIdx + 1} / {chapters.length}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => navigateChapter('next')} disabled={!hasNext}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: hasNext ? 1 : 0.3 }}
        >
          <Text style={{ color: colors.accent, fontSize: 14 }}>
            {hasNext ? `Cap. ${chapters[chapterIdx + 1]}` : ''}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Selection action bar ──────────────────────────────────

  // Acciones del versículo. Era una BARRA de una sola fila (5 colores + hasta 9
  // iconos) y en Android no cabía: las últimas acciones se salían por la derecha,
  // sin scroll ni pista de que estaban ahí. Ahora es una hoja inferior con
  // rejilla, como en la web — cabe todo y cada acción lleva su nombre.
  const renderActionSheet = () => {
    if (selectedCount === 0) return null;
    const id = firstSelected
      ? `${firstSelected.book}:${firstSelected.chapter}:${firstSelected.verse}`
      : '';

    // Las acciones que abren OTRO modal (nota, imagen, etiquetas, referencias,
    // oración) cierran antes esta hoja: en Android apilar dos Modals acaba con el
    // segundo invisible o tapado. `v` llega por parámetro, así que vaciar la
    // selección antes no lo pierde (con la nueva arquitectura el setter puede
    // hacer flush síncrono y dejar `firstSelected` a null a media función).
    const thenOpen = (fn: (v: VerseItem) => void) => (v: VerseItem) => {
      setSelectedVerses(new Map());
      fn(v);
    };

    return (
      <VerseActionsSheet
        count={selectedCount}
        verse={firstSelected}
        colors={colors}
        bottomInset={insets.bottom}
        highlightColors={HIGHLIGHT_COLORS}
        allFav={allFav}
        anyHighlighted={anyHighlighted}
        hasNote={!!firstSelected && !!getAnnotation(id)}
        hasTags={!!firstSelected && getVerseTags(id).length > 0}
        isMemorized={!!firstSelected && memorizeList.some((m) => m.id === id)}
        onClose={() => setSelectedVerses(new Map())}
        // Resaltar, favorito y compartir NO cierran: son de un toque y el usuario
        // suele encadenarlos (guardar y además resaltar).
        onHighlight={applyHighlight}
        onClearHighlight={clearHighlight}
        onFavorite={handleFavoriteToggle}
        onShare={handleShare}
        onSendToChat={handleSendToChat}
        onMemorize={handleMemorizeAdd} // muestra un Alert, no un Modal: puede quedarse abierta
        onNote={thenOpen(openAnnotation)}
        onImage={thenOpen(setImageVerse)}
        onTags={thenOpen(openTagsModal)}
        onXrefs={thenOpen(setXrefVerse)}
        onPray={thenOpen(openPrayerModal)}
      />
    );
  };

  // ─── Content views ─────────────────────────────────────────



  // Tarjeta del versículo del día (#8). Mismo versículo para todos cada día:
  // se puede guardar, compartir como imagen o abrir el capítulo entero.

  // Etiquetas del versículo: chips sugeridos (+ los que ya use el usuario) y
  // opción de crear la suya.

  // Pedir oración por un versículo: elegir grupo + escribir la petición.
  // KeyboardAvoidingView como wrapper MÁS EXTERNO (si va dentro del backdrop,
  // el maxHeight no tiene referencia y el modal queda cortado).

  // Tarjeta de petición de oración: una al azar, sin responder, de los grupos del
  // usuario. La elige el backend (`/users/me/prayer-feed`, el mismo del popup
  // diario) y devuelve null si no hay grupos o peticiones → no se pinta.

  // Cabecera de la lista de libros: las tarjetas de "hoy" y el banner de
  // descarga. Cada una vive en src/components/bible/.
  const renderBooksHeader = () => (
    <>
      <DailyVerseCard
        daily={daily}
        photo={dailyPhoto}
        isFavorite={!!daily && isFavorite(`${daily.book}:${daily.chapter}:${daily.verse}`)}
        reminder={dailyReminder}
        colors={colors}
        onToggleFavorite={(item, id) =>
          isFavorite(id) ? removeFavorite(id) : addFavorite({ id, ...item })
        }
        onShareImage={setImageVerse}
        onRead={(item) =>
          goToReference({ book: item.book, chapter: item.chapter, verse: item.verse })
        }
        onToggleReminder={toggleDailyReminder}
      />

      {/* Lee con tu grupo. Antes esto solo se encontraba entrando al menú de los
          tres puntos → Planes → Empezar, o sea: no se encontraba. */}
      <GroupPlanCard
        photo={groupPhoto}
        plan={activeGroupPlan}
        groupCount={myGroups.length}
        colors={colors}
        onOpen={openPlans}
      />

      <ContinueReadingCard
        lastRead={lastRead}
        photo={continuePhoto}
        colors={colors}
        onResume={resumeReading}
        onDismiss={() => clearLastRead()}
      />

      {/* La petición de oración cierra la portada. */}
      <PrayerFeedCard
        prayer={prayerFeed}
        praying={prayerFeedDone}
        colors={colors}
        onPray={prayForFeed}
      />

      <DownloadBanner
        version={selectedVersion}
        isDownloaded={downloadedVersions.has(selectedVersion)}
        isDownloading={downloadingVersion === selectedVersion}
        progress={downloadProgress}
        colors={colors}
        onDownload={() => handleDownload(selectedVersion)}
        onCancel={handleCancelDownload}
        onDelete={() => handleDeleteDownload(selectedVersion)}
      />
    </>
  );

  // Portada de la Biblia: el selector Libro/Capítulo arriba (fijo) y las tarjetas
  // debajo.
  //
  // La lista de los 66 libros ya NO se pinta aquí: se eligen desde el selector de
  // arriba, que además tiene buscador. Tenerla también debajo de las tarjetas era
  // repetir lo mismo dos veces y obligaba a un scroll larguísimo para llegar al
  // final de la portada. El selector la sustituye por completo.
  const renderBooks = () => (
    <>
      <BookChapterPicker
        books={sortedBooks}
        chapters={chapters}
        selectedBook={selectedBook}
        selectedChapter={selectedChapter}
        colors={colors}
        bottomInset={insets.bottom}
        onPickBook={selectBookInline}
        onPickChapter={selectChapter}
      />

      {loading && sortedBooks.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {renderBooksHeader()}
        </ScrollView>
      )}
    </>
  );

  const renderChapters = () => {
    if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.accent} /></View>;
    return (
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 }}>
        {chapters.map((ch) => (
          <TouchableOpacity
            key={ch}
            onPress={() => selectChapter(ch)}
            style={{
              width: 56, height: 56, borderRadius: 12,
              backgroundColor: selectedChapter === ch ? colors.accent : colors.bgTertiary,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: selectedChapter === ch ? colors.accent : colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: selectedChapter === ch ? '#fff' : colors.textPrimary }}>
              {ch}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Lectura en vista paralela (#5): dos columnas, versículo a versículo. La
  // versión principal (izquierda) manda: resaltados, notas y selección son
  // suyos; la de comparación solo se lee.
  const renderReadingCompare = () => {
    const compareBook = selectedBook
      ? mapBookToVersion(selectedBook, selectedVersion, compareVersion!)
      : null;
    const leftShort = VERSION_META[selectedVersion]?.short ?? selectedVersion;
    const rightShort = VERSION_META[compareVersion!]?.short ?? compareVersion;
    // En dos columnas el texto es la mitad de ancho: baja un punto la letra para
    // que no queden líneas de dos palabras.
    const fs = Math.max(MIN_FONT, fontSize - 1);

    if (!compareBook) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Este libro no existe en {rightShort}.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={compareRows}
        keyExtractor={(r) => r.verse}
        contentContainerStyle={{ paddingBottom: 8 }}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={{
            flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
            backgroundColor: colors.bgSecondary,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <Text style={{ flex: 1, color: colors.accent, fontSize: 12, fontWeight: '700' }}>{leftShort}</Text>
            <Text style={{ flex: 1, color: colors.accent, fontSize: 12, fontWeight: '700' }}>{rightShort}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const key = `${selectedBook}:${selectedChapter}:${item.verse}`;
          const isSelected = selectedVerses.has(key);
          const hl = getHighlight(key);
          const bg = isSelected
            ? colors.accent + '30'
            : hl
            ? hl.color + 'AA'
            : flashVerse === item.verse
            ? colors.accent + '1A'
            : 'transparent';
          const textColor = hl ? '#1f2937' : colors.textPrimary;
          return (
            <TouchableOpacity
              onPress={() =>
                item.left &&
                toggleVerse({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.left })
              }
              onLongPress={() =>
                item.left &&
                setHighlightTarget({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.left })
              }
              style={{
                flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 10,
                backgroundColor: bg,
                borderBottomWidth: 1, borderBottomColor: colors.borderLight,
              }}
            >
              <View style={{ flex: 1, flexDirection: 'row' }}>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 11, width: 20, marginTop: 2 }}>
                  {item.verse}
                </Text>
                <Text style={{ flex: 1, color: textColor, fontSize: fs, lineHeight: fs * 1.55 }}>
                  {item.left ?? '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textColor, fontSize: fs, lineHeight: fs * 1.55 }}>
                  {item.right ?? '—'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderReading = () => {
    if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.accent} /></View>;
    if (compareVersion) return renderReadingCompare();
    return (
      <FlatList
        ref={versesRef}
        data={verses}
        keyExtractor={(v) => v.verse}
        // Tema de lectura: en sepia el fondo del panel de texto cambia (el resto
        // de la pantalla mantiene el tema de la app).
        style={{ backgroundColor: readBg }}
        contentContainerStyle={{ paddingVertical: 8, backgroundColor: readBg }}
        // El salto a una referencia puede pedir un versículo que aún no se ha
        // medido; sin esto scrollToIndex lanzaría.
        onScrollToIndexFailed={({ index }) => {
          setTimeout(
            () => versesRef.current?.scrollToIndex({ index, viewPosition: 0.25, animated: true }),
            300
          );
        }}
        renderItem={({ item }) => {
          const key = `${selectedBook}:${selectedChapter}:${item.verse}`;
          const isSelected = selectedVerses.has(key);
          const hl = getHighlight(key);
          const annotation = getAnnotation(key);
          // El versículo que está sonando (#6) se resalta para poder seguir la
          // lectura con la vista.
          const isSpeaking = speech.currentId === item.verse;
          // El versículo al que se acaba de saltar (#7) parpadea unos segundos.
          const isFlash = flashVerse === item.verse;
          const bg = isSelected
            ? colors.accent + '30'
            : hl
            ? hl.color + 'AA'
            : isSpeaking || isFlash
            ? colors.accent + '1A'
            : 'transparent';
          return (
            <TouchableOpacity
              onPress={() => toggleVerse({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.text })}
              onLongPress={() => setHighlightTarget({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.text })}
              style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: bg }}
            >
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12, width: 28, marginTop: 4 }}>
                {item.verse}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{
                  color: hl ? '#1f2937' : readText,
                  fontSize,
                  lineHeight: fontSize * 1.65,
                  fontFamily: readFontFamily,
                }}>
                  {item.text}
                </Text>
                {annotation && (
                  <TouchableOpacity
                    onPress={() => openAnnotation({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.text })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <Ionicons name="create" size={12} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 12, flex: 1 }} numberOfLines={2}>
                      {annotation.note}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  // `query` (solo en Buscar): resalta el término encontrado, ignorando tildes.
  const renderVerseRow = (item: BibleSearchResult | BibleFavorite, query = '') => {
    const key = `${item.book}:${item.chapter}:${item.verse}`;
    const isSelected = selectedVerses.has(key);
    const hl = getHighlight(key);
    const annotation = getAnnotation(key);
    const bg = isSelected ? colors.accent + '20' : hl ? hl.color + '60' : 'transparent';
    return (
      <TouchableOpacity
        onPress={() => toggleVerse(item)}
        onLongPress={() => setHighlightTarget(item)}
        style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: bg }}
      >
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 3 }}>
          {item.book} {item.chapter}:{item.verse}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: fontSize - 2, lineHeight: (fontSize - 2) * 1.6 }}>
          {highlightParts(item.text, query).map((part, i) =>
            part.hit ? (
              <Text key={i} style={{ backgroundColor: '#FEF08A', color: '#1f2937', fontWeight: '700' }}>
                {part.text}
              </Text>
            ) : (
              <Text key={i}>{part.text}</Text>
            )
          )}
        </Text>
        {/* Etiquetas del versículo (viven en el favorito) */}
        {(item as BibleFavorite).tags?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {(item as BibleFavorite).tags!.map((t) => (
              <View
                key={t}
                style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                  borderWidth: 1, borderColor: colors.accent,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {annotation && (
          <TouchableOpacity
            onPress={() => openAnnotation(item)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}
          >
            <Ionicons name="create" size={12} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, flex: 1 }} numberOfLines={2}>
              {annotation.note}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Tarjeta "Ir a Juan 3:16" (#7): aparece encima de los resultados en cuanto lo
  // escrito se reconoce como una referencia.
  const renderRefCard = () => {
    if (!refMatch) return null;
    return (
      <TouchableOpacity
        onPress={() => goToReference(refMatch)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          margin: 12, padding: 14, borderRadius: 14,
          backgroundColor: colors.accent + '18',
          borderWidth: 1, borderColor: colors.accent,
        }}
      >
        <Ionicons name="navigate" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Ir a
          </Text>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginTop: 2 }}>
            {formatReference(refMatch)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
      </TouchableOpacity>
    );
  };

  // Cabecera de Buscar: salto a referencia + filtro por testamento + historial.
  const renderSearchTools = () => {
    const chip = (active: boolean) => ({
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
      backgroundColor: active ? colors.accent : colors.bgTertiary,
      borderWidth: 1, borderColor: active ? colors.accent : colors.border,
    });

    return (
      <View>
        {renderRefCard()}

        {/* Filtros (testamento y libro) + cuántos resultados hay de verdad */}
        {searchResults.length > 0 && (
          <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([['all', 'Todo'], ['ot', 'A. Testamento'], ['nt', 'N. Testamento']] as const).map(
                ([id, label]) => (
                  <TouchableOpacity key={id} onPress={() => changeTestament(id)} style={chip(testament === id)}>
                    <Text style={{
                      fontSize: 12, fontWeight: '600',
                      color: testament === id ? '#fff' : colors.textSecondary,
                    }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              )}

              {/* Acotar a un libro concreto */}
              <TouchableOpacity onPress={() => setBookPickerOpen(true)} style={chip(!!searchBook)}>
                <Ionicons
                  name="book-outline"
                  size={13}
                  color={searchBook ? '#fff' : colors.textSecondary}
                />
                <Text style={{
                  fontSize: 12, fontWeight: '600', marginLeft: 5,
                  color: searchBook ? '#fff' : colors.textSecondary,
                }}>
                  {searchBook || 'Todos los libros'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {searchTotal} {searchTotal === 1 ? 'resultado' : 'resultados'}
              {searchBook ? ` en ${searchBook}` : ''} · mostrando {searchResults.length}
            </Text>
          </View>
        )}

        {/* Historial: se ofrece cuando aún no se ha escrito nada */}
        {searchQuery.trim().length < 3 && searchHistory.length > 0 && (
          <View style={{ paddingHorizontal: 12, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                Búsquedas recientes
              </Text>
              <TouchableOpacity onPress={clearSearchHistory}>
                <Text style={{ color: colors.danger, fontSize: 12 }}>Borrar</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {searchHistory.map((h) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => setSearchQuery(h)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                    backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderSearch = () => (
    <FlatList
      data={searchResults}
      keyExtractor={(r) => `${r.book}:${r.chapter}:${r.verse}`}
      ListHeaderComponent={renderSearchTools}
      ListEmptyComponent={
        loading
          ? <View style={{ padding: 60, alignItems: 'center' }}><ActivityIndicator color={colors.accent} /></View>
          : refMatch
          ? null
          : searchHistory.length > 0 && searchQuery.trim().length < 3
          ? null
          : <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 }}>
              {searchQuery.length >= 3 ? 'Sin resultados' : 'Busca una palabra o escribe una referencia (Juan 3:16)'}
            </Text>
      }
      renderItem={({ item }) => renderVerseRow(item, searchQuery)}
      // Cargar más: pide la siguiente página desde donde nos quedamos.
      ListFooterComponent={
        searchResults.length > 0 && searchResults.length < searchTotal ? (
          <TouchableOpacity
            onPress={() => doSearch(searchQuery.trim(), testament, searchBook, searchResults.length)}
            disabled={loading}
            style={{
              margin: 16, paddingVertical: 12, borderRadius: 20, alignItems: 'center',
              borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>
              {loading
                ? 'Cargando…'
                : `Cargar más (${searchTotal - searchResults.length} restantes)`}
            </Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );

  // Selector de libro del buscador (acotar la búsqueda a un libro concreto).
  const renderSearchBookPicker = () => (
    <Modal visible={bookPickerOpen} transparent animationType="fade" onRequestClose={() => setBookPickerOpen(false)}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
        onPress={() => setBookPickerOpen(false)}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: colors.bgSecondary, borderRadius: 18, maxHeight: '75%', overflow: 'hidden' }}
        >
          <Text style={{
            color: colors.textPrimary, fontSize: 16, fontWeight: '700',
            padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            Buscar solo en…
          </Text>
          <ScrollView>
            <TouchableOpacity
              onPress={() => changeSearchBook('')}
              style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
            >
              <Text style={{ color: !searchBook ? colors.accent : colors.textPrimary, fontWeight: !searchBook ? '700' : '400' }}>
                Todos los libros
              </Text>
            </TouchableOpacity>
            {sortedBooks.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => changeSearchBook(b)}
                style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
              >
                <Text style={{
                  color: searchBook === b ? colors.accent : colors.textPrimary,
                  fontWeight: searchBook === b ? '700' : '400',
                }}>
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // Vista "Notas y resaltados": lo resaltado y lo anotado, en un solo sitio.
  // Tocar una fila abre el pasaje; el botón rojo lo quita.
  const renderNotes = () => {
    const chip = (active: boolean) => ({
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
      backgroundColor: active ? colors.accent : colors.bgTertiary,
      borderWidth: 1, borderColor: active ? colors.accent : colors.border,
    });

    return (
      <FlatList
        data={notesItems as any[]}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ padding: 12, gap: 12 }}>
            {/* Resaltados | Notas */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['highlights', `Resaltados (${highlights.length})`], ['notes', `Notas (${annotations.length})`]] as const).map(
                ([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setNotesTab(id)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                      backgroundColor: notesTab === id ? colors.accent : colors.bgTertiary,
                      borderWidth: 1, borderColor: notesTab === id ? colors.accent : colors.border,
                    }}
                  >
                    <Text style={{
                      color: notesTab === id ? '#fff' : colors.textSecondary,
                      fontWeight: '600', fontSize: 13,
                    }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            {notesTab === 'highlights' ? (
              /* Filtro por significado del color */
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity onPress={() => setColorFilter('')} style={chip(!colorFilter)}>
                  <Text style={{ color: !colorFilter ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    Todos
                  </Text>
                </TouchableOpacity>
                {HIGHLIGHT_PALETTE.map((c) => {
                  const on = colorFilter === c.value;
                  return (
                    <TouchableOpacity key={c.value} onPress={() => setColorFilter(c.value)} style={chip(on)}>
                      <View style={{
                        width: 12, height: 12, borderRadius: 6, backgroundColor: c.value,
                        borderWidth: 1, borderColor: colors.border,
                      }} />
                      <Text style={{ color: on ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                        {c.meaning}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              /* Buscar dentro de lo que escribí (sin tildes) */
              <TextInput
                value={noteQuery}
                onChangeText={setNoteQuery}
                placeholder="Buscar en mis notas…"
                placeholderTextColor={colors.inputPlaceholder}
                style={{
                  backgroundColor: colors.inputBg, color: colors.inputText,
                  borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 15, paddingHorizontal: 24 }}>
            {notesTab === 'highlights'
              ? colorFilter
                ? 'No tienes resaltados de ese color.'
                : 'Todavía no has resaltado ningún versículo.'
              : noteQuery
              ? 'Ninguna nota coincide con esa búsqueda.'
              : 'Todavía no has escrito ninguna nota.'}
          </Text>
        }
        renderItem={({ item }) => {
          const key = `${item.book}:${item.chapter}:${item.verse}`;
          const text = verseTexts[key];
          const note = notesTab === 'notes' ? item.note : getAnnotation(item.id)?.note;
          const tags = getVerseTags(item.id);
          const stripe = notesTab === 'highlights' ? item.color : colors.accent;

          return (
            <TouchableOpacity
              onPress={() => goToReference({ book: item.book, chapter: item.chapter, verse: item.verse })}
              style={{
                marginHorizontal: 12, marginBottom: 10, padding: 12,
                borderRadius: 12, backgroundColor: colors.bgSecondary,
                borderLeftWidth: 4, borderLeftColor: stripe,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', flex: 1 }}>
                  {item.book} {item.chapter}:{item.verse}
                  {notesTab === 'highlights' && meaningOf(item.color) ? (
                    <Text style={{ color: colors.textMuted, fontWeight: '400' }}>
                      {'  '}{meaningOf(item.color)}
                    </Text>
                  ) : null}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    notesTab === 'highlights' ? removeHighlight(item.id) : deleteAnnotation(item.id)
                  }
                  hitSlop={10}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>

              {/* El texto del versículo se trae aparte: no se guarda con el
                  resaltado ni con la nota. */}
              <Text style={{ color: colors.textPrimary, fontSize: fontSize - 2, lineHeight: (fontSize - 2) * 1.6, marginTop: 6 }}>
                {text ?? '…'}
              </Text>

              {note ? (
                <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: colors.bgTertiary }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>📝 {note}</Text>
                </View>
              ) : null}

              {tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {tags.map((t) => (
                    <View key={t} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.accent }}>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderFavorites = () => (
    <FlatList
      data={visibleFavorites}
      keyExtractor={(f) => f.id}
      // Filtro por etiqueta: solo si hay etiquetas que filtrar.
      ListHeaderComponent={
        allTags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
            {['', ...allTags].map((t) => {
              const on = tagFilter === t;
              return (
                <TouchableOpacity
                  key={t || 'all'}
                  onPress={() => setTagFilter(t)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: on ? colors.accent : colors.bgTertiary,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{ color: on ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    {t || 'Todas'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 }}>
          {tagFilter ? `Ningún favorito con la etiqueta “${tagFilter}”` : 'Sin versículos guardados'}
        </Text>
      }
      renderItem={({ item }) => renderVerseRow(item)}
    />
  );

  // ── Planes de lectura (#2) ─────────────────────────────────



  // ── Modal: crear mi plan (#D) ───────────────────────────────
  const canonicalForPicker = getCanonicalOrder(selectedVersion);


  const renderContent = () => {
    switch (view) {
      case 'books': return renderBooks();
      case 'chapters': return renderChapters();
      case 'reading': return renderReading();
      case 'search': return renderSearch();
      case 'favorites': return renderFavorites();
      case 'notes': return renderNotes();
      case 'topics':
        return (
          <TopicsView
            version={selectedVersion}
            colors={colors}
            bottomInset={insets.bottom}
            onOpenVerse={(v) =>
              goToReference({ book: v.book, chapter: v.chapter, verse: v.verse })
            }
            // Mantener pulsado SELECCIONA el versículo, y con eso aparece la barra
            // de acciones completa (favorito, colores, nota, etiquetas, imagen,
            // referencias cruzadas, memorizar, oración): se pinta fuera del
            // `switch` de vistas y solo pide que haya algo seleccionado.
            //
            // No uso `highlightTarget` (el gesto de la búsqueda) porque ese abre
            // la hoja de RESALTAR, que solo trae colores y nota — sería prometer
            // "todo" y entregar dos cosas.
            onLongPressVerse={toggleVerse}
          />
        );
      case 'memorize':
        return (
          <MemorizeView
            loading={memorizeLoading}
            verses={memorizeList}
            colors={colors}
            bottomInset={insets.bottom}
            onReview={handleMemorizeReview}
            onRemove={handleMemorizeRemove}
          />
        );
      case 'plans':
        return (
          <ReadingPlansView
            loading={plansLoading}
            myPlans={myPlans}
            catalog={planCatalog}
            busyKey={planBusy}
            colors={colors}
            bottomInset={insets.bottom}
            groupProgress={groupProgress}
            groupPlans={discoverGroupPlans}
            highlightGroupId={highlightGroupId}
            onOpenPassage={openPlanPassage}
            onToggleDay={togglePlanDay}
            onReminder={reminderMenu}
            onRestart={restartPlan}
            onAbandon={abandonPlan}
            onStart={startPlan}
            onJoinGroupPlan={joinGroupPlan}
            onStartGroupReading={startGroupReadingFromPlan}
            onCreate={() => setCreatePlanOpen(true)}
          />
        );
    }
  };

  // ─── Book order bar ───────────────────────────────────────

  const renderBookOrderBar = () => {
    if (view !== 'books') return null;
    return (
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16, paddingVertical: 10,
        paddingBottom: insets.bottom + 10,
        backgroundColor: colors.bgSecondary,
        borderTopWidth: 1, borderTopColor: colors.border,
        gap: 10,
      }}>
        <TouchableOpacity
          onPress={() => setBookOrder('traditional')}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: 22,
            backgroundColor: bookOrder === 'traditional' ? colors.accent : colors.bgTertiary,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: bookOrder === 'traditional' ? colors.accent : colors.border,
          }}
        >
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: bookOrder === 'traditional' ? '#fff' : colors.textSecondary,
          }}>
            Orden tradicional
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setBookOrder('alphabetical')}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: 22,
            backgroundColor: bookOrder === 'alphabetical' ? colors.accent : colors.bgTertiary,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: bookOrder === 'alphabetical' ? colors.accent : colors.border,
          }}
        >
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: bookOrder === 'alphabetical' ? '#fff' : colors.textSecondary,
          }}>
            Orden alfabético
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Highlight color picker ────────────────────────────────

  const renderHighlightPicker = () => {
    const targetId = highlightTarget ? `${highlightTarget.book}:${highlightTarget.chapter}:${highlightTarget.verse}` : '';
    const currentHl = getHighlight(targetId);

    return (
      <Modal visible={!!highlightTarget} transparent animationType="fade" onRequestClose={() => setHighlightTarget(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setHighlightTarget(null)}
        >
          <Pressable onPress={() => {}}>
            <View style={{
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              paddingBottom: insets.bottom + 16,
            }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 12 }}>
                Resaltar versículo
              </Text>

              {highlightTarget && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginHorizontal: 24, marginBottom: 20 }} numberOfLines={3}>
                  {highlightTarget.book} {highlightTarget.chapter}:{highlightTarget.verse} — {highlightTarget.text}
                </Text>
              )}

              {/* Cada color tiene un significado (Promesa, Mandato…): la leyenda
                  va aquí, que es donde se elige el color. */}
              <View style={{
                flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
                gap: 10, marginBottom: 24, paddingHorizontal: 12,
              }}>
                {HIGHLIGHT_PALETTE.map((c) => {
                  const isActive = currentHl?.color === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => applyHighlight(c.value)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14,
                        borderWidth: isActive ? 2 : 1,
                        borderColor: isActive ? colors.accent : colors.border,
                        backgroundColor: colors.bgTertiary,
                        minWidth: 130,
                      }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: c.value,
                        borderWidth: 1, borderColor: colors.border,
                      }} />
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 }}>
                        {c.meaning}
                      </Text>
                      {isActive && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Annotation shortcut from long-press */}
              <TouchableOpacity
                onPress={() => {
                  if (!highlightTarget) return;
                  const id = `${highlightTarget.book}:${highlightTarget.chapter}:${highlightTarget.verse}`;
                  const existing = getAnnotation(id);
                  setAnnotationText(existing?.note ?? '');
                  setAnnotationTarget(highlightTarget);
                  setHighlightTarget(null);
                }}
                style={{ marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 }}
              >
                <Ionicons name="create-outline" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>
                  {highlightTarget && getAnnotation(`${highlightTarget.book}:${highlightTarget.chapter}:${highlightTarget.verse}`)
                    ? 'Editar anotación'
                    : 'Añadir anotación'}
                </Text>
              </TouchableOpacity>

              {currentHl && (
                <TouchableOpacity
                  onPress={clearHighlight}
                  style={{ marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center', marginBottom: 8 }}
                >
                  <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 15 }}>Quitar resaltado</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setHighlightTarget(null)}
                style={{ marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  // ─── Annotation modal ──────────────────────────────────────

  const renderAnnotationModal = () => {
    if (!annotationTarget) return null;
    const id = `${annotationTarget.book}:${annotationTarget.chapter}:${annotationTarget.verse}`;
    const existing = getAnnotation(id);

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => { setAnnotationTarget(null); setAnnotationText(''); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => { setAnnotationTarget(null); setAnnotationText(''); }} />
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 20,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="create-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 }}>
                Anotación
              </Text>
              <TouchableOpacity onPress={() => { setAnnotationTarget(null); setAnnotationText(''); }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Verse reference */}
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>
              {annotationTarget.book} {annotationTarget.chapter}:{annotationTarget.verse}
            </Text>

            {/* Verse text preview */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }} numberOfLines={3}>
              {annotationTarget.text}
            </Text>

            {/* Note input */}
            <View style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14, borderWidth: 1, borderColor: colors.border,
              paddingHorizontal: 14, paddingVertical: 10,
              marginBottom: 16, minHeight: 100,
            }}>
              <TextInput
                autoFocus
                multiline
                value={annotationText}
                onChangeText={setAnnotationText}
                placeholder="Escribe tu anotación aquí..."
                placeholderTextColor={colors.inputPlaceholder}
                style={{ color: colors.inputText, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }}
              />
            </View>

            {/* Actions */}
            <TouchableOpacity
              onPress={handleSaveAnnotation}
              style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', marginBottom: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar</Text>
            </TouchableOpacity>

            {existing && (
              <TouchableOpacity
                onPress={handleDeleteAnnotation}
                style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center', marginBottom: 8 }}
              >
                <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 15 }}>Eliminar anotación</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => { setAnnotationTarget(null); setAnnotationText(''); }}
              style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // ─── Dots menu ────────────────────────────────────────────


  // ─── Compare picker modal (#5) ────────────────────────────
  // Elige la segunda versión de la vista paralela (o la desactiva).


  // ─── Version picker modal ─────────────────────────────────


  // ─── Barra de reproducción (#6) ────────────────────────────
  // Solo mientras suena. Pausar en Android es parar y retomar desde el versículo
  // actual (expo-speech no tiene pause real ahí), que a efectos del usuario es
  // lo mismo. La velocidad se aplica al versículo siguiente.
  const renderSpeechBar = () => {
    if (view !== 'reading' || !speech.available || !speech.speaking) return null;
    const RATES = [0.75, 1, 1.25, 1.5];

    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: colors.bgSecondary,
        borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        <TouchableOpacity
          onPress={() => (speech.paused ? speech.resume() : speech.pause())}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
            backgroundColor: colors.accent,
          }}
        >
          <Ionicons name={speech.paused ? 'play' : 'pause'} size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            {speech.paused ? 'Continuar' : 'Pausar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={speech.stop} style={{ paddingHorizontal: 8, paddingVertical: 9 }}>
          <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>Detener</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          {speech.currentId && (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Versículo {speech.currentId}
            </Text>
          )}
        </View>

        {/* Velocidad: se cicla entre los 4 valores para no meter otro modal. */}
        <TouchableOpacity
          onPress={() => {
            const next = RATES[(RATES.indexOf(speech.rate) + 1) % RATES.length];
            speech.changeRate(next);
          }}
          style={{
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
            backgroundColor: colors.bgTertiary,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
            {String(speech.rate).replace('.', ',')}×
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Layout ────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {renderHeader()}
      <View style={{ flex: 1 }}>{renderContent()}</View>
      {renderBookOrderBar()}
      {renderSpeechBar()}
      {renderChapterNav()}
      {renderActionSheet()}
      {renderHighlightPicker()}
      {renderAnnotationModal()}
      <ReadingSettingsMenu
        visible={dotsMenuOpen}
        fontSize={fontSize}
        readingTheme={readingTheme}
        readingFont={readingFont}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setDotsMenuOpen(false)}
        onFontSize={setFontSize}
        onReadingTheme={changeReadingTheme}
        onReadingFont={changeReadingFont}
        onOpenFavorites={openFavorites}
        onOpenNotes={openNotes}
        onOpenPlans={openPlans}
        onOpenMemorize={openMemorize}
        onOpenTopics={openTopics}
        dueCount={memorizeList.filter((m) => m.isDue).length}
        streak={streak}
      />

      <VersionPickerModal
        visible={versionPickerOpen}
        versions={availableVersions}
        selectedVersion={selectedVersion}
        downloadedVersions={downloadedVersions}
        downloadingVersion={downloadingVersion}
        downloadProgress={downloadProgress}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setVersionPickerOpen(false)}
        onSelect={handleSelectVersion}
        onDownload={handleDownload}
        onCancelDownload={handleCancelDownload}
      />

      <ComparePickerModal
        visible={comparePickerOpen}
        versions={availableVersions}
        selectedVersion={selectedVersion}
        compareVersion={compareVersion}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setComparePickerOpen(false)}
        onSelect={(v) => { setCompareVersion(v); setComparePickerOpen(false); }}
      />

      <CreatePlanModal
        visible={createPlanOpen}
        books={getCanonicalOrder(selectedVersion)}
        groups={myGroups}
        saving={creatingPlan}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setCreatePlanOpen(false)}
        onCreate={submitCustomPlan}
      />

      {/* Elegir a qué chat enviar el pasaje (mensaje `bible`). */}
      <SendToChatModal
        visible={!!sendChatPassage}
        conversations={conversations}
        currentUserId={useAuthStore.getState().user?.id}
        reference={sendChatPassage?.reference ?? ''}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setSendChatPassage(null)}
        onPick={sendPassageToConversation}
      />

      {/* Elegir con qué GRUPO leer este capítulo en vivo. */}
      <SendToChatModal
        visible={liveReadPickerOpen}
        conversations={myGroups}
        currentUserId={useAuthStore.getState().user?.id}
        reference={selectedBook && selectedChapter ? `${selectedBook} ${selectedChapter}` : ''}
        colors={colors}
        bottomInset={insets.bottom}
        title="Leer en grupo"
        onClose={() => setLiveReadPickerOpen(false)}
        onPick={startGroupReadingFromBible}
      />
      {imageVerse && (
        <VerseImageSheet
          verse={imageVerse}
          versionLabel={VERSION_META[selectedVersion]?.short ?? selectedVersion}
          onClose={() => setImageVerse(null)}
        />
      )}
      {renderSearchBookPicker()}

      {/* Etiquetas del versículo. El borrador vive DENTRO del modal, así que se
          monta solo cuando hay versículo: si estuviera siempre montado, al abrir
          otro versículo arrastraría las etiquetas del anterior. */}
      {tagsVerse && (
        <VerseTagsModal
          verse={tagsVerse}
          initialTags={getVerseTags(
            `${tagsVerse.book}:${tagsVerse.chapter}:${tagsVerse.verse}`
          )}
          usedTags={allTags}
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setTagsVerse(null)}
          onSave={saveTags}
        />
      )}

      {/* Con quién leer el plan (por mi cuenta o con un grupo). Se monta al
          abrirlo para que empiece limpio. */}
      {planToStart && (
        <GroupPlanPickerModal
          planTitle={planToStart.title ?? 'Plan de lectura'}
          groups={myGroups}
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setPlanToStart(null)}
          onPick={confirmStartPlan}
        />
      )}

      {/* Referencias cruzadas. Se monta al abrirlo: el modal pide las referencias
          en su useEffect, y montado en vano dispararía peticiones sin verse. */}
      {xrefVerse && token && (
        <CrossRefsModal
          verse={xrefVerse}
          token={token}
          version={selectedVersion}
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setXrefVerse(null)}
          onOpenRef={openCrossRef}
        />
      )}

      {/* Pedir oración por el versículo (se publica en un grupo). Igual: se monta
          al abrirlo para que el formulario empiece en blanco. */}
      {prayerVerse && (
        <PrayerRequestModal
          verse={prayerVerse}
          groups={myGroups}
          colors={colors}
          bottomInset={insets.bottom}
          onClose={() => setPrayerVerse(null)}
          onSubmit={submitPrayer}
        />
      )}
    </View>
  );
}

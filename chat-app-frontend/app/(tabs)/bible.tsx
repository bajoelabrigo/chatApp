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
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
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
  fetchReadingPlans,
  fetchMyReadingPlans,
  subscribeReadingPlan,
  createCustomReadingPlan,
  updateReadingPlan,
  toggleReadingPlanDay,
  unsubscribeReadingPlan,
} from '../../src/services/bibleService';
import type { BibleVerse, BibleSearchResult, BibleVersion } from '../../src/services/bibleService';
import VerseImageSheet from '../../src/components/bible/VerseImageSheet';

type ScreenView = 'books' | 'chapters' | 'reading' | 'search' | 'favorites' | 'plans';

const HIGHLIGHT_COLORS = ['#FEF08A', '#86EFAC', '#93C5FD', '#F9A8D4'];
const MIN_FONT = 13;
const MAX_FONT = 26;

// RVR1960 — Evangelios con prefijo "S."
const CANONICAL_ORDER_RVR1960 = [
  'Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio',
  'Josué', 'Jueces', 'Rut', '1 Samuel', '2 Samuel',
  '1 Reyes', '2 Reyes', '1 Crónicas', '2 Crónicas', 'Esdras',
  'Nehemías', 'Ester', 'Job', 'Salmos', 'Proverbios',
  'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones',
  'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós',
  'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc',
  'Sofonías', 'Hageo', 'Zacarías', 'Malaquías',
  'S. Mateo', 'S. Marcos', 'S. Lucas', 'S.Juan',
  'Hechos', 'Romanos', '1 Corintios', '2 Corintios', 'Gálatas',
  'Efesios', 'Filipenses', 'Colosenses', '1 Tesalonicenses', '2 Tesalonicenses',
  '1 Timoteo', '2 Timoteo', 'Tito', 'Filemón', 'Hebreos',
  'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan',
  '3 Juan', 'Judas', 'Apocalipsis',
];

// RVA — Evangelios sin prefijo
const CANONICAL_ORDER_RVA = [
  'Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio',
  'Josué', 'Jueces', 'Rut', '1 Samuel', '2 Samuel',
  '1 Reyes', '2 Reyes', '1 Crónicas', '2 Crónicas', 'Esdras',
  'Nehemías', 'Ester', 'Job', 'Salmos', 'Proverbios',
  'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones',
  'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós',
  'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc',
  'Sofonías', 'Hageo', 'Zacarías', 'Malaquías',
  'Mateo', 'Marcos', 'Lucas', 'Juan',
  'Hechos', 'Romanos', '1 Corintios', '2 Corintios', 'Gálatas',
  'Efesios', 'Filipenses', 'Colosenses', '1 Tesalonicenses', '2 Tesalonicenses',
  '1 Timoteo', '2 Timoteo', 'Tito', 'Filemón', 'Hebreos',
  'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan',
  '3 Juan', 'Judas', 'Apocalipsis',
];

// KJV / WEB — nombres en inglés
const CANONICAL_ORDER_EN = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John',
  'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John',
  '3 John', 'Jude', 'Revelation',
];

function getCanonicalOrder(version: string): string[] {
  if (version === 'RVA') return CANONICAL_ORDER_RVA;
  if (version === 'KJV' || version === 'WEB') return CANONICAL_ORDER_EN;
  return CANONICAL_ORDER_RVR1960;
}

const VERSION_META: Record<string, { name: string; short: string; lang: string }> = {
  RVR1960: { name: 'Reina Valera 1960',        short: 'RVR 1960', lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada',  short: 'RVA',      lang: 'es' },
  KJV:     { name: 'King James Version',         short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',         short: 'WEB',      lang: 'en' },
};

type BookOrder = 'traditional' | 'alphabetical';

interface VerseItem {
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

function formatForShare(verses: VerseItem[], versionName: string): string {
  return (
    verses.map((v) => `${v.book} ${v.chapter}:${v.verse}\n${v.text}`).join('\n\n') +
    `\n\n—Biblia ${versionName}`
  );
}

export default function BibleScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const {
    favorites, highlights, annotations, fontSize, selectedVersion,
    loadFavorites, loadHighlights, loadAnnotations, loadFontSize, loadSelectedVersion,
    addFavorite, removeFavorite, isFavorite,
    setHighlight, removeHighlight, getHighlight,
    saveAnnotation, deleteAnnotation, getAnnotation,
    setFontSize, setSelectedVersion, syncWithServer,
    lastRead, loadLastRead, setLastRead, clearLastRead,
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

  // Crear mi plan (#D)
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [cTitle, setCTitle] = useState('');
  const [cStart, setCStart] = useState(0);
  const [cEnd, setCEnd] = useState(65);
  const [cDays, setCDays] = useState('30');
  const [bookPickerFor, setBookPickerFor] = useState<null | 'start' | 'end'>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);

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
      if (availableVersions.length === 0 && token) {
        fetchVersions(token).then(setAvailableVersions).catch(() => {});
      }
    }, [])
  );

  const checkAllDownloads = async () => {
    const ids = ['RVR1960', 'RVA', 'KJV', 'WEB'];
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

  const selectBook = async (book: string) => {
    if (!token) return;
    setSelectedBook(book);
    setLoading(true);
    try { setChapters(await fetchChapters(token, book, selectedVersion)); setView('chapters'); }
    finally { setLoading(false); }
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
    }
    finally { setLoading(false); }
  };

  const doSearch = async (q: string) => {
    if (!token) return;
    setLoading(true);
    try { setSearchResults(await searchBible(token, q, selectedVersion)); }
    finally { setLoading(false); }
  };

  const navigateChapter = async (dir: 'prev' | 'next') => {
    if (!selectedChapter) return;
    const idx = chapters.indexOf(selectedChapter);
    const next = dir === 'prev' ? idx - 1 : idx + 1;
    if (next >= 0 && next < chapters.length) await selectChapter(chapters[next]);
  };

  const openSearch = () => { setPrevView(view); setView('search'); setSearchQuery(''); setSearchResults([]); };
  const openFavorites = () => { setPrevView(view); setView('favorites'); };

  // ── Planes de lectura (#2) ──────────────────────────────────
  const loadPlans = async () => {
    if (!token) return;
    setPlansLoading(true);
    try {
      const [cat, mine] = await Promise.all([
        fetchReadingPlans(token).catch(() => []),
        fetchMyReadingPlans(token).catch(() => []),
      ]);
      setPlanCatalog(cat);
      setMyPlans(mine);
    } finally {
      setPlansLoading(false);
    }
  };

  const openPlans = () => { setPrevView(view); setView('plans'); loadPlans(); };

  const submitCustomPlan = async () => {
    if (!token) return;
    if (cEnd < cStart) {
      Alert.alert('Revisa el rango', 'El libro final debe ir después (o igual) del inicial.');
      return;
    }
    setCreatingPlan(true);
    try {
      const sub = await createCustomReadingPlan(token, {
        title: cTitle.trim() || 'Mi plan',
        bookStart: cStart,
        bookEnd: cEnd,
        days: Math.max(1, parseInt(cDays, 10) || 1),
      });
      setMyPlans((prev) => [...prev, sub]);
      setCreatePlanOpen(false);
      setCTitle('');
    } catch {
      Alert.alert('Error', 'No se pudo crear el plan.');
    } finally {
      setCreatingPlan(false);
    }
  };

  const startPlan = async (planKey: string) => {
    if (!token) return;
    setPlanBusy(planKey);
    try {
      const sub = await subscribeReadingPlan(token, planKey);
      setMyPlans((prev) => [...prev.filter((p) => p.planKey !== planKey), sub]);
    } catch { /* ignora */ }
    finally { setPlanBusy(null); }
  };

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
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (view === 'reading') setView('chapters');
    else if (view === 'chapters') setView('books');
    else if (view === 'search' || view === 'favorites' || view === 'plans')
      setView(prevView === 'search' || prevView === 'favorites' || prevView === 'plans' ? 'books' : prevView);
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
    await Share.share({ message: formatForShare(list, vName) });
    setSelectedVerses(new Map());
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
    if (view === 'plans') title = 'Planes de lectura';
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
          placeholder="Buscar en la Biblia..."
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

  const renderActionBar = () => {
    if (selectedCount === 0) return null;
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 10,
        paddingBottom: insets.bottom + 10,
        backgroundColor: colors.bgSecondary,
        borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        {/* Color buttons */}
        {HIGHLIGHT_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            onPress={() => applyHighlight(color)}
            style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: color,
              borderWidth: 2, borderColor: colors.border,
            }}
          />
        ))}
        {anyHighlighted && (
          <TouchableOpacity
            onPress={clearHighlight}
            style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: colors.bgTertiary,
              borderWidth: 2, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="remove" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        {/* Annotation button — shows when exactly 1 verse is selected */}
        {selectedCount === 1 && firstSelected && (
          <TouchableOpacity onPress={() => openAnnotation(firstSelected)} style={{ padding: 8 }}>
            <Ionicons
              name="create-outline"
              size={20}
              color={getAnnotation(`${firstSelected.book}:${firstSelected.chapter}:${firstSelected.verse}`) ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>
        )}

        {/* Compartir como imagen — solo con 1 versículo seleccionado */}
        {selectedCount === 1 && firstSelected && (
          <TouchableOpacity onPress={() => setImageVerse(firstSelected)} style={{ padding: 8 }}>
            <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleFavoriteToggle} style={{ padding: 8 }}>
          <FontAwesome5 name="star" solid={allFav} size={18} color={allFav ? '#FBBF24' : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={{ padding: 8 }}>
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedVerses(new Map())} style={{ padding: 8 }}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Content views ─────────────────────────────────────────

  const renderDownloadBanner = () => {
    const isDownloaded = downloadedVersions.has(selectedVersion);
    const isDownloading = downloadingVersion === selectedVersion;
    const vName = VERSION_META[selectedVersion]?.name ?? selectedVersion;
    return (
      <View style={{
        margin: 16, borderRadius: 16,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
      }}>
        {isDownloaded ? (
          /* ── Downloaded state ── */
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{vName} descargada</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Disponible sin conexión</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleDeleteDownload(selectedVersion)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        ) : isDownloading ? (
          /* ── Downloading state ── */
          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14, flex: 1 }}>
                Descargando {vName}... {Math.round(downloadProgress * 100)}%
              </Text>
              <TouchableOpacity onPress={handleCancelDownload}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ height: 6, backgroundColor: colors.bgTertiary, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(downloadProgress * 100)}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
            </View>
          </View>
        ) : (
          /* ── Not downloaded state ── */
          <TouchableOpacity
            onPress={() => handleDownload(selectedVersion)}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
            activeOpacity={0.7}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="download-outline" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Descargar para uso sin conexión</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>~5 MB · Funciona sin internet</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderContinueCard = () => {
    if (!lastRead) return null;
    const vShort = VERSION_META[lastRead.version]?.short ?? lastRead.version;
    return (
      <View style={{
        marginHorizontal: 16, marginTop: 16, borderRadius: 16,
        backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity
          onPress={resumeReading}
          activeOpacity={0.85}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
        >
          <Ionicons name="book" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Continuar leyendo</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>
              {lastRead.book} {lastRead.chapter} · {vShort}
            </Text>
          </View>
          <Ionicons name="play" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => clearLastRead()} style={{ padding: 14 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderBooksHeader = () => (
    <>
      {renderContinueCard()}
      {renderDownloadBanner()}
    </>
  );

  const renderBooks = () => (
    <FlatList
      data={sortedBooks}
      keyExtractor={(item) => item}
      ListHeaderComponent={renderBooksHeader}
      ListEmptyComponent={
        loading
          ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 }}><ActivityIndicator color={colors.accent} size="large" /></View>
          : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => selectBook(item)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
        >
          <Text style={{ flex: 1, fontSize: 16, color: colors.textPrimary }}>{item}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    />
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

  const renderReading = () => {
    if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.accent} /></View>;
    return (
      <FlatList
        data={verses}
        keyExtractor={(v) => v.verse}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => {
          const key = `${selectedBook}:${selectedChapter}:${item.verse}`;
          const isSelected = selectedVerses.has(key);
          const hl = getHighlight(key);
          const annotation = getAnnotation(key);
          const bg = isSelected
            ? colors.accent + '30'
            : hl
            ? hl.color + 'AA'
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
                <Text style={{ color: colors.textPrimary, fontSize: fontSize, lineHeight: fontSize * 1.65 }}>
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

  const renderVerseRow = (item: BibleSearchResult | BibleFavorite) => {
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
        <Text style={{ color: colors.textPrimary, fontSize: fontSize - 2, lineHeight: (fontSize - 2) * 1.6 }}>{item.text}</Text>
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

  const renderSearch = () => (
    <FlatList
      data={searchResults}
      keyExtractor={(r) => `${r.book}:${r.chapter}:${r.verse}`}
      ListEmptyComponent={
        loading
          ? <View style={{ padding: 60, alignItems: 'center' }}><ActivityIndicator color={colors.accent} /></View>
          : <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 }}>
              {searchQuery.length >= 3 ? 'Sin resultados' : 'Escribe al menos 3 caracteres'}
            </Text>
      }
      renderItem={({ item }) => renderVerseRow(item)}
    />
  );

  const renderFavorites = () => (
    <FlatList
      data={favorites}
      keyExtractor={(f) => f.id}
      ListEmptyComponent={
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 }}>
          Sin versículos guardados
        </Text>
      }
      renderItem={({ item }) => renderVerseRow(item)}
    />
  );

  // ── Planes de lectura (#2) ─────────────────────────────────
  const renderPlanCard = (plan: any) => {
    const pct = plan.totalDays ? Math.round((plan.completedCount / plan.totalDays) * 100) : 0;
    return (
      <View key={plan.planKey} style={{
        margin: 16, marginBottom: 0, borderRadius: 16, padding: 16,
        backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{plan.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Día {plan.currentDay} de {plan.totalDays} · {plan.completedCount} leídos
            </Text>
          </View>
          <TouchableOpacity onPress={() => reminderMenu(plan)} style={{ padding: 4 }}>
            <Ionicons name={plan.reminderEnabled ? 'notifications' : 'notifications-off-outline'} size={20} color={plan.reminderEnabled ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Barra de progreso */}
        <View style={{ height: 6, backgroundColor: colors.bgTertiary, borderRadius: 3, overflow: 'hidden', marginTop: 12 }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
        </View>

        {plan.isFinished ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#22c55e', fontWeight: '600', marginBottom: 10 }}>¡Plan completado! 🎉</Text>
            <TouchableOpacity
              onPress={() => restartPlan(plan)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.accent }}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Volver a empezar</Text>
            </TouchableOpacity>
          </View>
        ) : plan.today ? (
          <View style={{ marginTop: 12, backgroundColor: colors.bgTertiary, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Hoy · Día {plan.today.day}
            </Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15, marginTop: 3 }}>{plan.today.label}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => { const r = plan.today.references?.[0]; if (r) openPlanPassage(r.book, r.startChapter); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.accent }}
              >
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Leer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => togglePlanDay(plan)}
                disabled={planBusy === plan.planKey}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: plan.isTodayDone ? '#22c55e' : colors.border, backgroundColor: plan.isTodayDone ? '#22c55e22' : 'transparent' }}
              >
                <Ionicons name="checkmark" size={14} color={plan.isTodayDone ? '#22c55e' : colors.textSecondary} />
                <Text style={{ color: plan.isTodayDone ? '#22c55e' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {plan.isTodayDone ? 'Leído' : 'Marcar leído'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
          <TouchableOpacity onPress={() => restartPlan(plan)}>
            <Text style={{ color: colors.accent, fontSize: 12 }}>Volver a empezar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => abandonPlan(plan.planKey)}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>Abandonar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCatalogCard = (plan: any) => (
    <View key={plan.key} style={{
      margin: 16, marginBottom: 0, borderRadius: 16, padding: 16,
      backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>{plan.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{plan.description}</Text>
        <Text style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>{plan.totalDays} días · {plan.category}</Text>
      </View>
      <TouchableOpacity
        onPress={() => startPlan(plan.key)}
        disabled={planBusy === plan.key}
        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.accent }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Empezar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPlans = () => {
    if (plansLoading) {
      return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.accent} /></View>;
    }
    const subscribedKeys = new Set(myPlans.map((p) => p.planKey));
    const available = planCatalog.filter((p) => !subscribedKeys.has(p.key));
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {myPlans.length > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16 }}>
            Mis planes
          </Text>
        )}
        {myPlans.map(renderPlanCard)}

        {/* Crear mi plan (#D) */}
        <TouchableOpacity
          onPress={() => setCreatePlanOpen(true)}
          style={{
            marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>Crear mi plan</Text>
        </TouchableOpacity>

        {available.length > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 24 }}>
            {myPlans.length > 0 ? 'Otros planes' : 'Empieza un plan de lectura'}
          </Text>
        )}
        {available.map(renderCatalogCard)}
      </ScrollView>
    );
  };

  // ── Modal: crear mi plan (#D) ───────────────────────────────
  const canonicalForPicker = getCanonicalOrder(selectedVersion);

  const renderCreatePlanModal = () => (
    <Modal visible={createPlanOpen} transparent animationType="slide" onRequestClose={() => setCreatePlanOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={() => setCreatePlanOpen(false)} />
        <View style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 14 }}>Crear mi plan</Text>

          <TextInput
            value={cTitle}
            onChangeText={setCTitle}
            placeholder="Nombre del plan"
            placeholderTextColor={colors.inputPlaceholder}
            style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.inputText, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Desde</Text>
              <TouchableOpacity onPress={() => setBookPickerFor('start')} style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>{canonicalForPicker[cStart] ?? '—'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Hasta</Text>
              <TouchableOpacity onPress={() => setBookPickerFor('end')} style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>{canonicalForPicker[cEnd] ?? '—'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Días</Text>
          <TextInput
            value={cDays}
            onChangeText={setCDays}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={colors.inputPlaceholder}
            style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.inputText, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 16 }}
          />

          <TouchableOpacity
            onPress={submitCustomPlan}
            disabled={creatingPlan}
            style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', marginBottom: 8, opacity: creatingPlan ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Crear plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCreatePlanOpen(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Selector de libro */}
      <Modal visible={bookPickerFor !== null} transparent animationType="fade" onRequestClose={() => setBookPickerFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} onPress={() => setBookPickerFor(null)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, maxHeight: '70%', overflow: 'hidden' }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15, padding: 16 }}>
              {bookPickerFor === 'start' ? 'Libro inicial' : 'Libro final'}
            </Text>
            <FlatList
              data={canonicalForPicker}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => { if (bookPickerFor === 'start') setCStart(index); else setCEnd(index); setBookPickerFor(null); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );

  const renderContent = () => {
    switch (view) {
      case 'books': return renderBooks();
      case 'chapters': return renderChapters();
      case 'reading': return renderReading();
      case 'search': return renderSearch();
      case 'favorites': return renderFavorites();
      case 'plans': return renderPlans();
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

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
                {HIGHLIGHT_COLORS.map((color) => {
                  const isActive = currentHl?.color === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      onPress={() => applyHighlight(color)}
                      style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: color,
                        borderWidth: isActive ? 3 : 2,
                        borderColor: isActive ? colors.textPrimary : colors.border,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isActive && <Ionicons name="checkmark" size={22} color={colors.textPrimary} />}
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

  const renderDotsMenu = () => (
    <Modal visible={dotsMenuOpen} transparent animationType="slide" onRequestClose={() => setDotsMenuOpen(false)}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={() => setDotsMenuOpen(false)}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: insets.bottom + 16,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

            {/* Font size */}
            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
                Tamaño de letra
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setFontSize(fontSize - 1)}
                  disabled={fontSize <= MIN_FONT}
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: colors.bgTertiary, alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                    opacity: fontSize <= MIN_FONT ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Aa−</Text>
                </TouchableOpacity>

                <View style={{ width: 52, alignItems: 'center' }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>{fontSize}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>pt</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setFontSize(fontSize + 1)}
                  disabled={fontSize >= MAX_FONT}
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: colors.bgTertiary, alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                    opacity: fontSize >= MAX_FONT ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '700' }}>Aa+</Text>
                </TouchableOpacity>
              </View>

              {/* Size track */}
              <View style={{ height: 3, backgroundColor: colors.bgTertiary, borderRadius: 2, marginTop: 16, overflow: 'hidden' }}>
                <View style={{
                  height: '100%',
                  width: `${((fontSize - MIN_FONT) / (MAX_FONT - MIN_FONT)) * 100}%`,
                  backgroundColor: colors.accent, borderRadius: 2,
                }} />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.borderLight, marginHorizontal: 20, marginVertical: 12 }} />

            {/* Favorites */}
            <TouchableOpacity
              onPress={() => { setDotsMenuOpen(false); openFavorites(); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FBBF2422', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="star" size={18} color="#FBBF24" />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Mis favoritos</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Reading plans */}
            <TouchableOpacity
              onPress={() => { setDotsMenuOpen(false); openPlans(); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar" size={20} color={colors.accent} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Planes de lectura</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setDotsMenuOpen(false)}
              style={{ marginHorizontal: 20, marginTop: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ─── Version picker modal ─────────────────────────────────

  const renderVersionPicker = () => (
    <Modal
      visible={versionPickerOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setVersionPickerOpen(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={() => setVersionPickerOpen(false)}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            paddingBottom: insets.bottom + 16,
          }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginVertical: 12 }}>
              Versión de la Biblia
            </Text>

            {(availableVersions.length > 0
              ? availableVersions
              : Object.entries(VERSION_META).map(([id, m]) => ({ id, name: m.name, short: m.short, lang: m.lang as 'es' | 'en' }))
            ).map((v) => {
              const isActive = v.id === selectedVersion;
              const isDownloaded = downloadedVersions.has(v.id);
              const isDownloading = downloadingVersion === v.id;
              const langEmoji = v.lang === 'en' ? '🇬🇧' : '🇪🇸';

              return (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => handleSelectVersion(v.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                    backgroundColor: isActive ? colors.accent + '15' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{langEmoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: isActive ? '700' : '500' }}>
                      {v.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{v.short}</Text>
                  </View>

                  {/* Status badge / download button */}
                  {isDownloaded ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#22c55e22' }}>
                      <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                      <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>Descargada</Text>
                    </View>
                  ) : isDownloading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.accent, fontSize: 12 }}>{Math.round(downloadProgress * 100)}%</Text>
                      <TouchableOpacity onPress={handleCancelDownload}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); handleDownload(v.id); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Ionicons name="download-outline" size={14} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Descargar</Text>
                    </TouchableOpacity>
                  )}

                  {isActive && <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setVersionPickerOpen(false)}
              style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ─── Layout ────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {renderHeader()}
      <View style={{ flex: 1 }}>{renderContent()}</View>
      {renderBookOrderBar()}
      {renderChapterNav()}
      {renderActionBar()}
      {renderHighlightPicker()}
      {renderAnnotationModal()}
      {renderDotsMenu()}
      {renderVersionPicker()}
      {renderCreatePlanModal()}
      {imageVerse && (
        <VerseImageSheet
          verse={imageVerse}
          versionLabel={VERSION_META[selectedVersion]?.short ?? selectedVersion}
          onClose={() => setImageVerse(null)}
        />
      )}
    </View>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  Share,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/useAuthStore';
import { useBibleStore, type BibleFavorite } from '../../store/useBibleStore';
import {
  fetchVersions,
  fetchBooks,
  fetchChapters,
  fetchVerses,
  searchBible,
  isBibleDownloaded,
  type BibleVerse,
  type BibleSearchResult,
  type BibleVersion,
} from '../../services/bibleService';

type BibleView = 'books' | 'chapters' | 'verses' | 'search';

interface SelectedVerse {
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSendVerses: (text: string) => void;
}

const MIN_FONT = 13;
const MAX_FONT = 26;

const VERSION_META: Record<string, { name: string; short: string; lang: string }> = {
  RVR1960: { name: 'Reina Valera 1960',       short: 'RVR 1960', lang: 'es' },
  RVA:     { name: 'Reina Valera Actualizada', short: 'RVA',      lang: 'es' },
  KJV:     { name: 'King James Version',        short: 'KJV',      lang: 'en' },
  WEB:     { name: 'World English Bible',        short: 'WEB',      lang: 'en' },
};

function formatVersesForShare(verses: SelectedVerse[], versionName: string): string {
  return (
    verses.map((v) => `${v.book} ${v.chapter}:${v.verse}\n${v.text}`).join('\n\n') +
    `\n\n—Biblia ${versionName}`
  );
}

export default function BibleModal({ visible, onClose, onSendVerses }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const {
    favorites, selectedVersion, fontSize,
    loadFavorites, loadSelectedVersion, loadFontSize, setSelectedVersion, setFontSize,
    addFavorite, removeFavorite, isFavorite,
  } = useBibleStore();

  const [view, setView] = useState<BibleView>('books');
  const [books, setBooks] = useState<string[]>([]);
  const [chapters, setChapters] = useState<string[]>([]);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [searchResults, setSearchResults] = useState<BibleSearchResult[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedVerses, setSelectedVerses] = useState<Map<string, SelectedVerse>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);

  // Version picker
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<BibleVersion[]>([]);
  const [downloadedVersions, setDownloadedVersions] = useState<Set<string>>(new Set());

  // Dots menu
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      loadFavorites();
      loadSelectedVersion();
      loadFontSize();
      if (books.length === 0) doLoadBooks(selectedVersion);
      if (token && availableVersions.length === 0) {
        fetchVersions(token).then(setAvailableVersions).catch(() => {});
      }
      checkAllDownloads();
    }
  }, [visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setView('books');
      setSelectedBook(null);
      setSelectedChapter(null);
      setSelectedVerses(new Map());
      setSearchQuery('');
      setSearchResults([]);
      setShowFavorites(false);
    }
  }, [visible]);

  // Reload books when version changes from store (e.g. changed in main Bible tab)
  useEffect(() => {
    if (visible && selectedVersion) {
      setBooks([]);
      doLoadBooks(selectedVersion);
    }
  }, [selectedVersion]);

  // Debounced search
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim();
    if (q.length < 3) {
      if (view === 'search') setView('books');
      return;
    }
    searchDebounce.current = setTimeout(() => { doSearch(q); }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery]);

  const checkAllDownloads = async () => {
    const ids = ['RVR1960', 'RVA', 'KJV', 'WEB'];
    const results = await Promise.all(ids.map((id) => isBibleDownloaded(id)));
    const downloaded = new Set<string>();
    ids.forEach((id, i) => { if (results[i]) downloaded.add(id); });
    setDownloadedVersions(downloaded);
  };

  const doLoadBooks = useCallback(async (version?: string) => {
    if (!token) return;
    const v = version ?? selectedVersion;
    setLoading(true);
    try {
      const data = await fetchBooks(token, v);
      setBooks(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la Biblia');
    } finally {
      setLoading(false);
    }
  }, [token, selectedVersion]);

  const doSelectBook = useCallback(async (book: string) => {
    if (!token) return;
    setSelectedBook(book);
    setLoading(true);
    try {
      const data = await fetchChapters(token, book, selectedVersion);
      setChapters(data);
      setView('chapters');
    } catch {
      Alert.alert('Error', 'No se pudo cargar los capítulos');
    } finally {
      setLoading(false);
    }
  }, [token, selectedVersion]);

  const doSelectChapter = useCallback(async (chapter: string) => {
    if (!token || !selectedBook) return;
    setSelectedChapter(chapter);
    setLoading(true);
    try {
      const data = await fetchVerses(token, selectedBook, chapter, selectedVersion);
      setVerses(data);
      setView('verses');
    } catch {
      Alert.alert('Error', 'No se pudo cargar los versículos');
    } finally {
      setLoading(false);
    }
  }, [token, selectedBook, selectedVersion]);

  const doSearch = useCallback(async (q: string) => {
    if (!token) return;
    setLoading(true);
    setView('search');
    try {
      const data = await searchBible(token, q, selectedVersion);
      setSearchResults(data);
    } catch {
      Alert.alert('Error', 'Error al buscar');
    } finally {
      setLoading(false);
    }
  }, [token, selectedVersion]);

  const handleSelectVersion = async (version: string) => {
    if (version === selectedVersion) { setVersionPickerOpen(false); return; }
    await setSelectedVersion(version);
    setVersionPickerOpen(false);
    setView('books');
    setSelectedBook(null);
    setSelectedChapter(null);
    setBooks([]);
    setChapters([]);
    setVerses([]);
    setSelectedVerses(new Map());
    doLoadBooks(version);
  };

  const toggleVerseSelection = useCallback((verse: SelectedVerse) => {
    const key = `${verse.book}:${verse.chapter}:${verse.verse}`;
    setSelectedVerses((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key); else next.set(key, verse);
      return next;
    });
  }, []);

  const handleSend = useCallback(() => {
    const list = Array.from(selectedVerses.values());
    if (list.length === 0) return;
    const vName = VERSION_META[selectedVersion]?.name ?? selectedVersion;
    onSendVerses(formatVersesForShare(list, vName));
  }, [selectedVerses, onSendVerses, selectedVersion]);

  const handleShare = useCallback(async () => {
    const list = Array.from(selectedVerses.values());
    if (list.length === 0) return;
    const vName = VERSION_META[selectedVersion]?.name ?? selectedVersion;
    await Share.share({ message: formatVersesForShare(list, vName) });
  }, [selectedVerses, selectedVersion]);

  const handleFavoriteToggle = useCallback(async () => {
    const list = Array.from(selectedVerses.values());
    if (list.length === 0) return;
    for (const v of list) {
      const id = `${v.book}:${v.chapter}:${v.verse}`;
      const fav: BibleFavorite = { id, ...v };
      if (isFavorite(id)) await removeFavorite(id);
      else await addFavorite(fav);
    }
  }, [selectedVerses, isFavorite, addFavorite, removeFavorite]);

  const goBack = useCallback(() => {
    if (view === 'verses') { setView('chapters'); setSelectedVerses(new Map()); }
    else if (view === 'chapters') { setView('books'); }
    else if (view === 'search') { setView('books'); setSearchResults([]); }
  }, [view]);

  const selectedCount = selectedVerses.size;
  const allSelectedAreFavorites =
    selectedCount > 0 &&
    Array.from(selectedVerses.keys()).every((k) => isFavorite(k));

  // ─── Styles ───────────────────────────────────────────
  const s = {
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingTop: insets.top + 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgSecondary,
    },
    title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' as const, textAlign: 'center' as const },
    backBtn: { width: 36, height: 36, justifyContent: 'center' as const, alignItems: 'center' as const },
    closeBtn: { width: 36, height: 36, justifyContent: 'center' as const, alignItems: 'center' as const },
    searchBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      margin: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.inputBg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, color: colors.inputText, fontSize: 15, paddingVertical: 10, paddingHorizontal: 8 },
    bookItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    bookText: { color: colors.textPrimary, fontSize: 16, flex: 1 },
    chapterGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, padding: 12, gap: 8 },
    chapterBtn: {
      width: 52, height: 52,
      borderRadius: 12,
      backgroundColor: colors.bgTertiary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chapterBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' as const },
    verseItem: (selected: boolean) => ({
      flexDirection: 'row' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      backgroundColor: selected ? colors.accent + '20' : 'transparent',
    }),
    verseNum: { color: colors.accent, fontWeight: '700' as const, fontSize: 13, width: 30, marginTop: 2 },
    verseText: { color: colors.textPrimary, fontSize: fontSize, flex: 1, lineHeight: fontSize * 1.6 },
    actionBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bgSecondary,
      gap: 8,
    },
    actionBtn: (primary?: boolean) => ({
      flex: primary ? 2 : 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: primary ? colors.accent : colors.bgTertiary,
      gap: 6,
      borderWidth: primary ? 0 : 1,
      borderColor: colors.border,
    }),
    actionBtnText: (primary?: boolean) => ({
      color: primary ? '#fff' : colors.textPrimary,
      fontWeight: '600' as const,
      fontSize: 14,
    }),
    favRef: { color: colors.accent, fontSize: 13, fontWeight: '700' as const, marginBottom: 3 },
    favText: { color: colors.textPrimary, fontSize: Math.max(13, fontSize - 1), lineHeight: Math.max(13, fontSize - 1) * 1.5 },
    emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' as const, marginTop: 40 },
  };

  const vShort = VERSION_META[selectedVersion]?.short ?? selectedVersion;

  const renderHeader = () => {
    let title = '';
    if (view === 'chapters' && selectedBook) title = selectedBook;
    else if (view === 'verses' && selectedBook && selectedChapter) title = `${selectedBook} ${selectedChapter}`;
    else if (view === 'search') title = 'Resultados';

    return (
      <View style={s.header}>
        {/* Back button or spacer */}
        {view !== 'books' ? (
          <TouchableOpacity style={s.backBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}

        {/* Title / version pill / favorites title */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {showFavorites && view === 'books' ? (
            <Text style={s.title} numberOfLines={1}>Mis favoritos</Text>
          ) : view === 'books' ? (
            <TouchableOpacity
              onPress={() => setVersionPickerOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 18, backgroundColor: colors.bgTertiary,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{vShort}</Text>
              <Ionicons name="chevron-down" size={13} color={colors.accent} />
            </TouchableOpacity>
          ) : (
            <Text style={s.title} numberOfLines={1}>{title}</Text>
          )}
        </View>

        {/* Dots + close */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={s.backBtn} onPress={() => setDotsMenuOpen(true)}>
            <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchBar = () => (
    <View style={s.searchBar}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        ref={searchInputRef}
        style={s.searchInput}
        placeholder="Buscar en la Biblia..."
        placeholderTextColor={colors.inputPlaceholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={() => setSearchQuery('')}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderActionBar = () => {
    if (selectedCount === 0) return null;
    return (
      <View style={s.actionBar}>
        <TouchableOpacity style={s.actionBtn()} onPress={handleFavoriteToggle}>
          <FontAwesome5
            name="star"
            solid={allSelectedAreFavorites}
            size={15}
            color={allSelectedAreFavorites ? '#FBBF24' : colors.textSecondary}
          />
          <Text style={s.actionBtnText()}>Fav.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn()} onPress={handleShare}>
          <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
          <Text style={s.actionBtnText()}>Copiar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn(true)} onPress={handleSend}>
          <Ionicons name="send" size={15} color="#fff" />
          <Text style={s.actionBtnText(true)}>Enviar ({selectedCount})</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Dots menu ────────────────────────────────────────
  const renderDotsMenu = () => (
    <Modal visible={dotsMenuOpen} transparent animationType="slide" onRequestClose={() => setDotsMenuOpen(false)}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={() => setDotsMenuOpen(false)}
      >
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 }}>
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
              <View style={{ height: 3, backgroundColor: colors.bgTertiary, borderRadius: 2, marginTop: 14, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${((fontSize - MIN_FONT) / (MAX_FONT - MIN_FONT)) * 100}%`, backgroundColor: colors.accent, borderRadius: 2 }} />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.borderLight, marginHorizontal: 20, marginVertical: 12 }} />

            {/* Favorites */}
            <TouchableOpacity
              onPress={() => { setDotsMenuOpen(false); setShowFavorites(true); setView('books'); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FBBF2422', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="star" size={18} color="#FBBF24" />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Mis favoritos</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Search */}
            <TouchableOpacity
              onPress={() => {
                setDotsMenuOpen(false);
                setShowFavorites(false);
                setView('books');
                setTimeout(() => searchInputRef.current?.focus(), 150);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="search" size={20} color={colors.accent} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }}>Buscar</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setDotsMenuOpen(false)}
              style={{ marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ─── Version picker (bottom sheet inside main modal) ──
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
            paddingBottom: 24,
          }}>
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
                  {isDownloaded && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#22c55e22', marginRight: 8 }}>
                      <Ionicons name="checkmark-circle" size={13} color="#22c55e" />
                      <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '600' }}>Sin conexión</Text>
                    </View>
                  )}
                  {isActive && <Ionicons name="checkmark" size={18} color={colors.accent} />}
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

  // ─── Content views ────────────────────────────────────

  const renderFavorites = () => (
    <FlatList
      data={favorites}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={s.emptyText}>Sin versículos guardados</Text>}
      renderItem={({ item }) => {
        const key = item.id;
        const isSelected = selectedVerses.has(key);
        return (
          <TouchableOpacity
            style={s.verseItem(isSelected)}
            onPress={() => toggleVerseSelection({ book: item.book, chapter: item.chapter, verse: item.verse, text: item.text })}
          >
            <Text style={s.verseNum}>{item.verse}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.favRef}>{item.book} {item.chapter}:{item.verse}</Text>
              <Text style={s.favText}>{item.text}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderBooks = () => (
    <FlatList
      data={books}
      keyExtractor={(item) => item}
      ListEmptyComponent={loading ? null : <Text style={s.emptyText}>Cargando libros...</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={s.bookItem} onPress={() => doSelectBook(item)}>
          <Text style={s.bookText}>{item}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    />
  );

  const renderChapters = () => (
    <ScrollView contentContainerStyle={s.chapterGrid}>
      {chapters.map((ch) => (
        <TouchableOpacity key={ch} style={s.chapterBtn} onPress={() => doSelectChapter(ch)}>
          <Text style={s.chapterBtnText}>{ch}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderVerses = () => (
    <FlatList
      data={verses}
      keyExtractor={(item) => item.verse}
      renderItem={({ item }) => {
        const key = `${selectedBook}:${selectedChapter}:${item.verse}`;
        const isSelected = selectedVerses.has(key);
        return (
          <TouchableOpacity
            style={s.verseItem(isSelected)}
            onPress={() => toggleVerseSelection({ book: selectedBook!, chapter: selectedChapter!, verse: item.verse, text: item.text })}
          >
            <Text style={s.verseNum}>{item.verse}</Text>
            <Text style={s.verseText}>{item.text}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderSearchResults = () => (
    <FlatList
      data={searchResults}
      keyExtractor={(item) => `${item.book}:${item.chapter}:${item.verse}`}
      ListEmptyComponent={
        loading ? null : (
          <Text style={s.emptyText}>
            {searchQuery.length >= 3 ? 'Sin resultados' : 'Escribe al menos 3 caracteres'}
          </Text>
        )
      }
      renderItem={({ item }) => {
        const key = `${item.book}:${item.chapter}:${item.verse}`;
        const isSelected = selectedVerses.has(key);
        return (
          <TouchableOpacity style={s.verseItem(isSelected)} onPress={() => toggleVerseSelection(item)}>
            <Text style={s.verseNum}>{item.verse}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.favRef}>{item.book} {item.chapter}:{item.verse}</Text>
              <Text style={s.verseText}>{item.text}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderContent = () => {
    if (loading && (view === 'books' ? books.length === 0 : view === 'chapters' ? chapters.length === 0 : verses.length === 0)) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }
    if (showFavorites && view === 'books') return renderFavorites();
    if (view === 'books') return renderBooks();
    if (view === 'chapters') return renderChapters();
    if (view === 'verses') return renderVerses();
    if (view === 'search') return renderSearchResults();
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        {renderHeader()}

        {(view === 'books' || view === 'search') && !showFavorites && renderSearchBar()}

        {loading && view !== 'books' && (
          <View style={{ paddingVertical: 8, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}

        <View style={{ flex: 1 }}>{renderContent()}</View>

        {renderActionBar()}
        {renderDotsMenu()}
        {renderVersionPicker()}
      </View>
    </Modal>
  );
}

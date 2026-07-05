import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  ActivityIndicator, Linking, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/context/ThemeContext';
import {
  getGroupMedia,
  type GroupMedia,
  type GroupMediaFile,
  type GroupMediaLink,
} from '../../src/services/conversationService';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

// URL sin el fragmento (#name=...), para src/href y detectar extensión.
const cleanUrl = (url = '') => url.split('#')[0];

// Nombre a mostrar: el original si está en el fragmento; si no, uno por extensión.
function fileDisplayName(url = ''): string {
  const m = url.match(/#name=([^#]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  const ext = (cleanUrl(url).split('.').pop() || 'archivo').toLowerCase();
  return `Archivo.${ext}`;
}

const ext = (url = '') => (cleanUrl(url).split('.').pop() || '').toLowerCase();
const isImage = (url = '') => ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext(url));
const isVideo = (url = '') => ['mp4', 'mov', 'webm', 'ogg', 'm4v'].includes(ext(url));

function hostnameOf(url = ''): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Caché a nivel de módulo del título/imagen de cada enlace (evita re-pedir la
// metadata al reabrir la pantalla o cambiar de pestaña).
const linkMetaCache = new Map<string, any>();

// Fila de un enlace compartido: muestra el NOMBRE del enlace (p.ej. el título
// del video de YouTube) en lugar de la URL cruda. La metadata viene del endpoint
// /public/link-preview del backend (igual que la web).
function GroupLinkRow({ url, colors }: { url: string; colors: any }) {
  const [meta, setMeta] = useState<any>(() => linkMetaCache.get(url));

  useEffect(() => {
    if (linkMetaCache.has(url)) { setMeta(linkMetaCache.get(url)); return; }
    let active = true;
    fetch(`${API_URL}/public/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { linkMetaCache.set(url, d); if (active) setMeta(d); })
      .catch(() => { /* red caída: se reintenta al reabrir */ });
    return () => { active = false; };
  }, [url]);

  const title = meta?.title || url;
  const site = meta?.siteName || hostnameOf(url);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => Linking.openURL(url)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.bgSecondary }}
    >
      {meta?.image ? (
        <Image source={{ uri: meta.image }} style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bgTertiary }} />
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.accent}26`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="link" size={18} color={colors.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: colors.accent, fontSize: 12 }}>{site}</Text>
      </View>
    </TouchableOpacity>
  );
}

function FileTile({ file, colors }: { file: GroupMediaFile; colors: any }) {
  const url = cleanUrl(file.url);
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url)}
      activeOpacity={0.8}
      style={{ flex: 1 / 3, aspectRatio: 1, margin: 3, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border }}
    >
      {isImage(file.url) ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : isVideo(file.url) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Ionicons name="play-circle" size={34} color="#fff" />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 }}>
          <Ionicons name="musical-notes" size={28} color={colors.accent} />
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center' }}>
            {fileDisplayName(file.url)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DocRow({ doc, colors }: { doc: GroupMediaFile; colors: any }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(cleanUrl(doc.url))}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.bgSecondary }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.16)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="document-text" size={18} color="#f59e0b" />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>
        {doc.fileName || fileDisplayName(doc.url)}
      </Text>
      <Ionicons name="download-outline" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const TABS = [
  { key: 'files', label: 'Archivos' },
  { key: 'links', label: 'Enlaces' },
  { key: 'docs', label: 'Docs' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function GroupMediaScreen() {
  const { colors, isDark } = useTheme();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();

  const [data, setData] = useState<GroupMedia>({ files: [], links: [], docs: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('files');

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);
    getGroupMedia(token, conversationId)
      .then((res) => { if (mounted) setData(res); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token, conversationId]);

  const counts = { files: data.files.length, links: data.links.length, docs: data.docs.length };

  const Empty = ({ text }: { text: string }) => (
    <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 48 }}>{text}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Archivos, enlaces y docs</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: active ? colors.accent : 'transparent' }}
            >
              <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? colors.accent : colors.textSecondary }}>
                {t.label} ({counts[t.key]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : tab === 'files' ? (
        <FlatList
          key="files"
          data={data.files}
          keyExtractor={(item) => item._id}
          numColumns={3}
          contentContainerStyle={{ padding: 5 }}
          renderItem={({ item }) => <FileTile file={item} colors={colors} />}
          ListEmptyComponent={<Empty text="No hay fotos ni archivos multimedia." />}
        />
      ) : tab === 'links' ? (
        <FlatList
          key="links"
          data={data.links}
          keyExtractor={(item, i) => `${item._id}-${i}`}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }: { item: GroupMediaLink }) => <GroupLinkRow url={item.url} colors={colors} />}
          ListEmptyComponent={<Empty text="No se han compartido enlaces." />}
        />
      ) : (
        <FlatList
          key="docs"
          data={data.docs}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => <DocRow doc={item} colors={colors} />}
          ListEmptyComponent={<Empty text="No se han compartido documentos." />}
        />
      )}
    </SafeAreaView>
  );
}

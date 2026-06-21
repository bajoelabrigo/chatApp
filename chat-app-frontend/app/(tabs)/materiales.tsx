import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import {
  getMaterials,
  markMaterialViewed,
  downloadMaterial,
  priceLabel,
  type Material,
} from '../../src/services/materialsService';
import MaterialBanner from '../../src/components/MaterialBanner';

const WEB_URL = 'https://holyholyholy.es';

type SortKey = 'recent' | 'name' | 'downloads';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recientes' },
  { key: 'name', label: 'Nombre' },
  { key: 'downloads', label: 'Descargas' },
];

// Texto plano de una descripción HTML (de Quill) para poder buscar en ella.
const plainText = (html?: string) =>
  (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export default function MaterialesScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Búsqueda y filtros.
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [freeOnly, setFreeOnly] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Todas las etiquetas presentes en el catálogo (para los chips de filtro).
  const allTags = useMemo(() => {
    const map = new Map<string, string>(); // lowercase -> etiqueta original
    materials.forEach((m) =>
      (m.tags || []).forEach((t) => {
        const key = t.toLowerCase();
        if (!map.has(key)) map.set(key, t);
      })
    );
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag]
    );

  // Aplica búsqueda + filtros + ordenamiento.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = materials.filter((m) => {
      if (freeOnly && (m.price || 0) > 0) return false;
      if (activeTags.length) {
        const tags = (m.tags || []).map((t) => t.toLowerCase());
        if (!activeTags.some((t) => tags.includes(t.toLowerCase()))) return false;
      }
      if (q) {
        const haystack = [
          m.title || '',
          (m.tags || []).join(' '),
          plainText(m.description),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return (a.title || '').localeCompare(b.title || '');
      if (sort === 'downloads') return (b.salesCount || 0) - (a.salesCount || 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return list;
  }, [materials, query, freeOnly, activeTags, sort]);

  const hasFilters = !!query || freeOnly || activeTags.length > 0;
  const clearFilters = () => {
    setQuery('');
    setFreeOnly(false);
    setActiveTags([]);
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getMaterials(token);
      setMaterials(data);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onPressMaterial = async (m: Material) => {
    if (!token) return;
    markMaterialViewed(token, m._id).catch(() => {});
    if (!m.price || m.price <= 0) {
      // Gratis → descarga/abre los archivos dentro de la app (uno o varios).
      try {
        setBusyId(m._id);
        const data = await downloadMaterial(token, m._id);
        const urls = data.files?.length
          ? data.files.map((f) => f.url).filter(Boolean)
          : data.fileUrl
          ? [data.fileUrl]
          : [];
        // Abrir cada archivo en secuencia (el usuario cierra y se abre el siguiente).
        for (const url of urls) {
          await WebBrowser.openBrowserAsync(url);
        }
        load();
      } catch {
        Alert.alert('Error', 'No se pudo abrir el material.');
      } finally {
        setBusyId(null);
      }
    } else {
      // De pago → abrir la compra en el navegador EXTERNO (apto para Google Play).
      Linking.openURL(`${WEB_URL}/materiales/${m.slug}`);
    }
  };

  const renderItem = ({ item }: { item: Material }) => {
    const img = item.coverImage || item.thumbnail;
    const free = !item.price || item.price <= 0;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onPressMaterial(item)}
        style={{
          backgroundColor: colors.bgSecondary,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        {img ? (
          <Image source={{ uri: img }} style={{ width: '100%', height: 170 }} resizeMode="cover" />
        ) : (
          <View
            style={{
              width: '100%',
              height: 170,
              backgroundColor: colors.bgPrimary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="document-text-outline" size={42} color={colors.textMuted} />
          </View>
        )}
        <View style={{ padding: 14 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.tags?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {item.tags.slice(0, 3).map((t, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: colors.bgPrimary,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {t}
                  </Text>
                </View>
              ))}
              {item.tags.length > 3 && (
                <View
                  style={{
                    backgroundColor: colors.bgPrimary,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    +{item.tags.length - 3}
                  </Text>
                </View>
              )}
            </View>
          )}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
            }}
          >
            <View
              style={{
                backgroundColor: colors.accent,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 13 }}>
                {priceLabel(item)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons
                name={free ? 'download-outline' : 'open-outline'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {free ? 'Descargar' : 'Ver en la web'}
              </Text>
              {busyId === item._id && (
                <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 4 }} />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <View>
      <MaterialBanner />

      {/* Buscador */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bgSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          paddingHorizontal: 12,
          marginBottom: 12,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre, etiqueta o descripción…"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.textPrimary, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15 }}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Ordenar + solo gratis */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {SORTS.map((s) => {
          const on = sort === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSort(s.key)}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: on ? colors.accent : colors.bgSecondary,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
              }}
            >
              <Text style={{ color: on ? colors.accentText : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setFreeOnly((v) => !v)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: freeOnly ? colors.accent : colors.bgSecondary,
            borderWidth: 1,
            borderColor: freeOnly ? colors.accent : colors.border,
          }}
        >
          <Ionicons
            name={freeOnly ? 'checkmark-circle' : 'pricetag-outline'}
            size={14}
            color={freeOnly ? colors.accentText : colors.textSecondary}
          />
          <Text style={{ color: freeOnly ? colors.accentText : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            Solo gratis
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chips de etiquetas */}
      {allTags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          style={{ marginBottom: 14 }}
        >
          {allTags.map((tag) => {
            const on = activeTags.some((t) => t.toLowerCase() === tag.toLowerCase());
            return (
              <TouchableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: on ? colors.accent : colors.bgSecondary,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                }}
              >
                <Text style={{ color: on ? colors.accentText : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'left', 'right']}>
      <FlatList
        data={filtered}
        keyExtractor={(m) => m._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={ListHeader}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Ionicons name="library-outline" size={56} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }}>
              {materials.length === 0
                ? 'Aún no hay materiales disponibles.'
                : 'No se encontraron materiales con esos filtros.'}
            </Text>
            {hasFilters && materials.length > 0 && (
              <TouchableOpacity onPress={clearFilters} style={{ marginTop: 12 }}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

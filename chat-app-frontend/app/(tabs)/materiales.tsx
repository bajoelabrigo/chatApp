import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

export default function MaterialesScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <FlatList
        data={materials}
        keyExtractor={(m) => m._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={<MaterialBanner />}
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
            <Text style={{ color: colors.textMuted, marginTop: 12 }}>
              Aún no hay materiales disponibles.
            </Text>
          </View>
        }
      />
    </View>
  );
}

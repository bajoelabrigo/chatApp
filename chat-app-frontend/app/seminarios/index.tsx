import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { cld } from '../../src/lib/cldImage';
import { getSeminars, getMySeminars, type SeminarSummary, type MySeminarSummary } from '../../src/services/seminarService';
import { ProgressBar } from '../../src/components/seminarios/ProgressBar';

type Tab = 'catalogo' | 'mios';

export default function SeminariosScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [tab, setTab] = useState<Tab>('catalogo');
  const [catalog, setCatalog] = useState<SeminarSummary[]>([]);
  const [mine, setMine] = useState<MySeminarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [c, m] = await Promise.all([getSeminars(token), getMySeminars(token)]);
      setCatalog(c);
      setMine(m);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const Cover = ({ uri }: { uri?: string }) => uri ? (
    <Image source={{ uri: cld(uri, 340) }} style={{ width: '100%', height: 140 }} resizeMode="cover" />
  ) : (
    <View style={{ width: '100%', height: 140, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="school-outline" size={36} color={colors.textMuted} />
    </View>
  );

  const TabButton = ({ label, value }: { label: string; value: Tab }) => {
    const active = tab === value;
    return (
      <TouchableOpacity
        onPress={() => setTab(value)}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999, backgroundColor: active ? colors.accent : 'transparent' }}
      >
        <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Seminarios</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bgTertiary + '55' }}>
        <TabButton label="Catálogo" value="catalogo" />
        <TabButton label="Mis seminarios" value="mios" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : tab === 'catalogo' ? (
        <FlatList
          data={catalog}
          keyExtractor={(s) => s._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/seminarios/${item._id}` as any)}
              style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 14 }}
            >
              <Cover uri={item.coverImage} />
              <View style={{ padding: 14 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>{item.title}</Text>
                {!!item.description && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{item.description}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="play-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.classCount ?? 0} clases</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.participantsCount ?? 0} inscritos</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No hay seminarios disponibles.</Text>}
        />
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(s) => s._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/seminarios/${item._id}` as any)}
              style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 14 }}
            >
              <Cover uri={item.coverImage} />
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={2}>{item.title}</Text>
                  {item.hasCertificate && <Ionicons name="ribbon" size={18} color={colors.accent} />}
                </View>
                <View style={{ marginTop: 10 }}>
                  <ProgressBar completed={item.completedClasses} total={item.totalClasses} colors={colors} />
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                    {item.completedClasses} de {item.totalClasses} clases completadas
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Aún no te has inscrito en ningún seminario.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

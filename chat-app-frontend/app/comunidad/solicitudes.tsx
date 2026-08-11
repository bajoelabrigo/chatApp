import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { cld } from '../../src/lib/cldImage';
import {
  getConnectionRequests,
  acceptConnectionRequest,
  rejectConnectionRequest,
  type ConnectionRequestItem,
} from '../../src/services/connectionService';

export default function SolicitudesScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [requests, setRequests] = useState<ConnectionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getConnectionRequests(token);
      setRequests(data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAccept = async (req: ConnectionRequestItem) => {
    if (!token) return;
    setBusyId(req._id);
    try {
      await acceptConnectionRequest(token, req._id);
      setRequests((prev) => prev.filter((r) => r._id !== req._id));
    } catch {
      Alert.alert('Error', 'No se pudo aceptar la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: ConnectionRequestItem) => {
    if (!token) return;
    setBusyId(req._id);
    try {
      await rejectConnectionRequest(token, req._id);
      setRequests((prev) => prev.filter((r) => r._id !== req._id));
    } catch {
      Alert.alert('Error', 'No se pudo rechazar la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Solicitudes de conexión</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const busy = busyId === item._id;
            return (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: colors.bgSecondary, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border,
                padding: 12, marginBottom: 10,
              }}>
                <TouchableOpacity onPress={() => router.push(`/profile/${item.sender._id}` as any)}>
                  {item.sender.avatar ? (
                    <Image source={{ uri: cld(item.sender.avatar, 48) }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{item.sender.name?.[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{item.sender.name}</Text>
                  {!!item.sender.bio && <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{item.sender.bio}</Text>}
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => handleAccept(item)} style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Aceptar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleReject(item)} style={{ backgroundColor: colors.bgTertiary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Ionicons name="mail-open-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 12 }}>No tienes solicitudes pendientes.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/useAuthStore';
import {
  getConnectionStatus,
  sendConnectionRequest,
  cancelConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  type ConnectionStatus,
} from '../../services/connectionService';

// Botón de amistad de 5 estados (self|not_connected|pending|received|connected),
// según `GET /connections/status/:id`. Vive en la pantalla de perfil de
// Comunidad, no en cada tarjeta del feed (mantiene la tarjeta limpia).
export function FriendButton({ userId, onChange }: { userId: string; onChange?: (status: ConnectionStatus) => void }) {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getConnectionStatus(token, userId);
      setStatus(s);
      onChange?.(s);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!status || status.status === 'self') return null;

  const baseStyle = {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, paddingVertical: 12, borderRadius: 14,
  };

  if (status.status === 'not_connected') {
    return (
      <TouchableOpacity
        disabled={busy}
        onPress={() => act(() => sendConnectionRequest(token!, userId))}
        style={{ ...baseStyle, backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Conectar</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  if (status.status === 'pending') {
    return (
      <TouchableOpacity
        disabled={busy}
        onPress={() =>
          Alert.alert('Cancelar solicitud', '¿Cancelar la solicitud de conexión?', [
            { text: 'No', style: 'cancel' },
            { text: 'Sí, cancelar', style: 'destructive', onPress: () => act(() => cancelConnectionRequest(token!, status.requestId!)) },
          ])
        }
        style={{ ...baseStyle, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <ActivityIndicator color={colors.textSecondary} size="small" /> : (
          <>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Pendiente</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  if (status.status === 'received') {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          disabled={busy}
          onPress={() => act(() => acceptConnectionRequest(token!, status.requestId!))}
          style={{ ...baseStyle, flex: 1, backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Aceptar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() => act(() => rejectConnectionRequest(token!, status.requestId!))}
          style={{ ...baseStyle, flex: 1, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.7 : 1 }}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Rechazar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // connected
  return (
    <TouchableOpacity
      disabled={busy}
      onPress={() =>
        Alert.alert('Eliminar conexión', '¿Ya no quieres estar conectado con este usuario?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => act(() => removeConnection(token!, userId)) },
        ])
      }
      style={{ ...baseStyle, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.accent, opacity: busy ? 0.7 : 1 }}
    >
      {busy ? <ActivityIndicator color={colors.accent} size="small" /> : (
        <>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Conectado</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

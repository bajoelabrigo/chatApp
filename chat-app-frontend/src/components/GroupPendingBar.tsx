import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getSocket } from '../services/socketService';
import { cld } from '../lib/cldImage';
import {
  getPendingMembers,
  approvePendingMember,
  rejectPendingMember,
  PendingMember,
} from '../services/conversationService';

// Barra de solicitudes de ingreso pendientes (estilo WhatsApp) que ve el admin
// de un grupo con aprobación previa. Al tocar despliega la lista con botones
// para aceptar/rechazar. Solo se renderiza para admins con solicitudes.
export default function GroupPendingBar({
  groupId,
  token,
  isAdmin,
}: {
  groupId: string;
  token: string | null;
  isAdmin: boolean;
}) {
  const { colors } = useTheme();
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId || !isAdmin) return;
    setLoading(true);
    try {
      setPending(await getPendingMembers(token, groupId));
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [token, groupId, isAdmin]);

  useEffect(() => {
    setOpen(false);
    load();
  }, [load]);

  // Tiempo real: nuevas solicitudes o cambios de otro admin.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPending = (payload: { groupId?: string }) => {
      if (payload?.groupId === groupId) load();
    };
    socket.on('group:pending', onPending);
    return () => {
      socket.off('group:pending', onPending);
    };
  }, [groupId, load]);

  const approve = async (u: PendingMember) => {
    if (!token) return;
    setBusyId(u._id);
    try {
      await approvePendingMember(token, groupId, u._id);
      setPending((prev) => prev.filter((p) => p._id !== u._id));
    } catch {
      // noop
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (u: PendingMember) => {
    if (!token) return;
    setBusyId(u._id);
    try {
      await rejectPendingMember(token, groupId, u._id);
      setPending((prev) => prev.filter((p) => p._id !== u._id));
    } catch {
      // noop
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin || pending.length === 0) return null;

  return (
    <View
      style={{
        marginHorizontal: 8,
        marginTop: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.bgSecondary,
        overflow: 'hidden',
      }}
    >
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View>
          <Ionicons name="person-add" size={18} color={colors.accent} />
          <View
            style={{
              position: 'absolute',
              top: -6,
              right: -8,
              minWidth: 15,
              height: 15,
              borderRadius: 8,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 3,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{pending.length}</Text>
          </View>
        </View>
        <Text style={{ flex: 1, color: colors.accent, fontWeight: '700', fontSize: 13 }}>
          {pending.length === 1
            ? '1 usuario nuevo espera aprobación'
            : `${pending.length} usuarios nuevos esperan aprobación`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
      </TouchableOpacity>

      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          {loading ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            pending.map((u) => (
              <View
                key={u._id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Image
                  source={{ uri: cld(u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name), 36) }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }}>
                    {u.name}
                  </Text>
                  {!!u.email && (
                    <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                      {u.email}
                    </Text>
                  )}
                </View>
                {busyId === u._id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => approve(u)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: '#22C55E',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                    >
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Aceptar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => reject(u)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

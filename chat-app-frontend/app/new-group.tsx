import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/useAuthStore';
import { useChatsStore } from '../src/store/useChatsStore';
import { useTheme } from '../src/context/ThemeContext';
import {
  searchUsers,
  createGroup,
  getMyConnections,
  type ChatUser,
  type GroupPermissions,
} from '../src/services/conversationService';
import { getSocket } from '../src/services/socketService';

const TEMP_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Desactivado', value: null },
  { label: '24 h', value: 24 },
  { label: '7 días', value: 168 },
  { label: '90 días', value: 2160 },
];

function ToggleRow({
  label,
  sub,
  value,
  onChange,
  borderColor,
  textColor,
  subColor,
  trackFalse,
  trackTrue,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  borderColor: string;
  textColor: string;
  subColor: string;
  trackFalse: string;
  trackTrue: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderColor }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: textColor, fontSize: 14 }}>{label}</Text>
        {sub ? <Text style={{ color: subColor, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: trackFalse, true: trackTrue }}
        thumbColor="#fff"
      />
    </View>
  );
}

function Chip({ user, onRemove, colors }: { user: ChatUser; onRemove: () => void; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.accent}33`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
      {user.avatar ? (
        <Image source={{ uri: user.avatar }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 4 }} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 4, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 10, fontWeight: 'bold' }}>{user.name[0]?.toUpperCase()}</Text>
        </View>
      )}
      <Text style={{ color: colors.textPrimary, fontSize: 12, marginRight: 4 }} numberOfLines={1}>{user.name}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NewGroupScreen() {
  const { colors, isDark } = useTheme();
  const { token, user } = useAuthStore();
  const { upsertConversation, conversations } = useChatsStore();

  const contacts = useMemo(() => {
    const seen = new Set<string>();
    const users: ChatUser[] = [];
    for (const conv of conversations) {
      if (!conv.isGroup) {
        const other = conv.participants.find((p) => p._id !== user?.id);
        if (other && !seen.has(other._id)) {
          seen.add(other._id);
          users.push(other);
        }
      }
    }
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations, user?.id]);

  const [step, setStep] = useState<1 | 2>(1);

  const [selected, setSelected] = useState<ChatUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [searching, setSearching] = useState(false);

  // Por defecto sugerimos seguidores/conexiones; si no hay, contactos recientes.
  const [connections, setConnections] = useState<ChatUser[]>([]);
  useEffect(() => {
    if (!token) return;
    getMyConnections(token).then(setConnections).catch(() => {});
  }, [token]);

  const defaultUsers = connections.length > 0 ? connections : contacts;
  const defaultLabel = connections.length > 0 ? 'Seguidores y conexiones' : 'Contactos recientes';

  const [groupName, setGroupName] = useState('');
  const [permissions, setPermissions] = useState<GroupPermissions>({
    membersCanSend: true,
    membersCanAddMembers: true,
    membersCanInvite: true,
    requireAdminApproval: false,
  });
  const [tempDuration, setTempDuration] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const setPerm = (key: keyof GroupPermissions, val: boolean) =>
    setPermissions((prev) => ({ ...prev, [key]: val }));

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(token!, q);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [token]);

  const toggleUser = (u: ChatUser) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s._id === u._id);
      return exists ? prev.filter((s) => s._id !== u._id) : [...prev, u];
    });
  };

  const isSelected = (u: ChatUser) => selected.some((s) => s._id === u._id);

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Nombre requerido', 'Por favor ingresa un nombre para el grupo.');
      return;
    }
    if (!token || creating) return;
    setCreating(true);
    try {
      const conv = await createGroup(token, {
        name: groupName.trim(),
        participantIds: selected.map((u) => u._id),
        permissions,
        tempMessageDuration: tempDuration,
      });
      upsertConversation(conv);

      const socket = getSocket();
      if (socket) socket.emit('conversation:join', { conversationId: conv._id });

      router.replace({
        pathname: '/chat/[id]' as any,
        params: {
          id: conv._id,
          name: conv.groupName ?? 'Grupo',
          avatar: conv.groupAvatar ?? '',
          isGroup: '1',
        },
      });
    } catch {
      Alert.alert('Error', 'No se pudo crear el grupo. Inténtalo de nuevo.');
    } finally {
      setCreating(false);
    }
  };

  if (step === 1) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Nuevo grupo</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {selected.length > 0 ? `${selected.length} participante${selected.length > 1 ? 's' : ''} seleccionado${selected.length > 1 ? 's' : ''}` : 'Añade participantes'}
            </Text>
          </View>
          {selected.length > 0 && (
            <TouchableOpacity
              onPress={() => setStep(2)}
              style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Siguiente →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selected chips */}
        {selected.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            {selected.map((u) => (
              <Chip key={u._id} user={u} onRemove={() => toggleUser(u)} colors={colors} />
            ))}
          </View>
        )}

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <TextInput
            style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}
            placeholder="Buscar por nombre o email..."
            placeholderTextColor={colors.inputPlaceholder}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
        </View>

        {searching ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : (
          <FlatList
            data={searchQuery.length >= 2 ? searchResults : defaultUsers}
            keyExtractor={(item) => item._id}
            ListHeaderComponent={searchQuery.length < 2 && defaultUsers.length > 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                {defaultLabel}
              </Text>
            ) : null}
            renderItem={({ item }) => {
              const sel = isSelected(item);
              return (
                <Pressable
                  onPress={() => toggleUser(item)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  {/* Avatar */}
                  <View style={{ position: 'relative', marginRight: 12 }}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 16 }}>{item.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    {sel && (
                      <View style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.onlineDot, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgPrimary }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{item.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{item.email}</Text>
                  </View>

                  <View style={{
                    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                    borderColor: sel ? colors.onlineDot : colors.border,
                    backgroundColor: sel ? colors.onlineDot : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sel && <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }}>
                {searchQuery.length >= 2
                  ? 'Sin resultados'
                  : 'Escribe el nombre o correo para buscar personas.'}
              </Text>
            }
          />
        )}
      </SafeAreaView>
    );
  }

  // Step 2: Configure group
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => setStep(1)} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Nuevo grupo</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{selected.length + 1} participante{selected.length !== 0 ? 's' : ''}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Group name */}
        <View style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <MaterialIcons name="group-add" size={22} color="#fff" />
            </View>
            <TextInput
              style={{ flex: 1, color: colors.inputText, fontSize: 16, paddingVertical: 12 }}
              placeholder="Nombre del grupo"
              placeholderTextColor={colors.inputPlaceholder}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
              autoFocus
            />
          </View>
        </View>

        {/* Participant preview */}
        <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {selected.map((u) => u.name).join(', ')}
          </Text>
        </View>

        {/* Member permissions */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8 }}>
            Permisos de miembros
          </Text>
        </View>
        <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSecondary, marginBottom: 16 }}>
          <ToggleRow
            label="Enviar nuevos mensajes"
            sub="Los miembros pueden enviar mensajes en el grupo"
            value={permissions.membersCanSend}
            onChange={(v) => setPerm('membersCanSend', v)}
            borderColor={colors.border}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
            trackFalse={colors.border}
            trackTrue={colors.accent}
          />
          <ToggleRow
            label="Añadir nuevos miembros"
            sub="Los miembros pueden añadir otras personas"
            value={permissions.membersCanAddMembers}
            onChange={(v) => setPerm('membersCanAddMembers', v)}
            borderColor={colors.border}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
            trackFalse={colors.border}
            trackTrue={colors.accent}
          />
          <ToggleRow
            label="Invitar con enlace o QR"
            sub="Los miembros pueden compartir el enlace de invitación"
            value={permissions.membersCanInvite}
            onChange={(v) => setPerm('membersCanInvite', v)}
            borderColor={'transparent'}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
            trackFalse={colors.border}
            trackTrue={colors.accent}
          />
        </View>

        {/* Admin permissions */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8 }}>
            Permisos de administrador
          </Text>
        </View>
        <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSecondary, marginBottom: 16 }}>
          <ToggleRow
            label="Aprobar nuevos miembros"
            sub="Los administradores deben aprobar las solicitudes para unirse"
            value={permissions.requireAdminApproval}
            onChange={(v) => setPerm('requireAdminApproval', v)}
            borderColor={'transparent'}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
            trackFalse={colors.border}
            trackTrue={colors.accent}
          />
        </View>

        {/* Temp messages */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8 }}>
            Mensajes temporales
          </Text>
        </View>
        <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSecondary, marginBottom: 24 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Los mensajes se eliminarán automáticamente después del tiempo seleccionado.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
              {TEMP_OPTIONS.map((opt) => {
                const active = tempDuration === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    onPress={() => setTempDuration(opt.value)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active ? colors.accent : colors.bgTertiary,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '500', color: active ? '#fff' : colors.textSecondary }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Create button */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating || !groupName.trim()}
          style={{
            marginHorizontal: 16, marginBottom: 32, paddingVertical: 16, borderRadius: 16,
            alignItems: 'center',
            backgroundColor: groupName.trim() ? colors.accent : colors.bgSecondary,
          }}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontWeight: 'bold', fontSize: 16, color: groupName.trim() ? '#fff' : colors.textMuted }}>
              Crear grupo
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

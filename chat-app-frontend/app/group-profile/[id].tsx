import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Switch,
  FlatList,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useCallStore } from '../../src/store/useCallStore';
import { useGroupCallStore } from '../../src/store/useGroupCallStore';
import { useTheme } from '../../src/context/ThemeContext';
import {
  getGroupInfo,
  updateGroup,
  addGroupMembers,
  removeGroupMember,
  toggleGroupAdmin,
  createOrGetConversation,
  deleteGroup,
  leaveGroup,
  reportGroup,
  searchUsers,
  type GroupInfo,
  type ChatUser,
  type GroupPermissions,
} from '../../src/services/conversationService';
import { uploadFile } from '../../src/services/uploadService';

const TEMP_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Desactivado', value: null },
  { label: '24 horas', value: 24 },
  { label: '7 días', value: 168 },
  { label: '90 días', value: 2160 },
];

function tempLabel(v: number | null | undefined): string {
  const opt = TEMP_OPTIONS.find((o) => o.value === (v ?? null));
  return opt?.label ?? 'Desactivado';
}

export default function GroupProfileScreen() {
  const { colors, isDark } = useTheme();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuthStore();
  const { conversations, upsertConversation, archiveConversation } = useChatsStore();
  const { callState, startCall } = useCallStore();
  const { isActive: groupCallActive, startGroupCall } = useGroupCallStore();

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [showPermissions, setShowPermissions] = useState(false);
  const [showTempMsg, setShowTempMsg] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);

  const [permEdit, setPermEdit] = useState<GroupPermissions>({
    membersCanSend: true,
    membersCanAddMembers: true,
    membersCanInvite: true,
    requireAdminApproval: false,
  });
  const [savingPerms, setSavingPerms] = useState(false);

  const [tempEdit, setTempEdit] = useState<number | null>(null);
  const [savingTemp, setSavingTemp] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [memberModal, setMemberModal] = useState<ChatUser | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState(false);

  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<ChatUser[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSelected, setAddSelected] = useState<ChatUser[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);

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

  const fetchGroup = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getGroupInfo(token, groupId);
      setGroup(data);
      setNameInput(data.groupName ?? '');
      setPermEdit(data.permissions ?? {
        membersCanSend: true,
        membersCanAddMembers: true,
        membersCanInvite: true,
        requireAdminApproval: false,
      });
      setTempEdit(data.tempMessageDuration ?? null);
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(useCallback(() => { fetchGroup(); }, [fetchGroup]));

  const handleSaveName = async () => {
    if (!token || !group) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === group.groupName) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const updated = await updateGroup(token, groupId, { name: trimmed });
      setGroup((g) => g ? { ...g, groupName: updated.groupName } : g);
      upsertConversation({ ...group, groupName: updated.groupName });
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el nombre');
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  const handleChangeAvatar = async () => {
    if (!group?.isAdmin || !token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el acceso a la galería.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const uploaded = await uploadFile(
        token, asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.uri.split('/').pop() ?? 'group.jpg'
      );
      Alert.alert('Foto actualizada', 'La foto del grupo ha sido actualizada.');
      setGroup((g) => g ? { ...g, groupAvatar: uploaded.url } : g);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la foto');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSavePerms = async () => {
    if (!token || !group) return;
    setSavingPerms(true);
    try {
      await updateGroup(token, groupId, { permissions: permEdit });
      setGroup((g) => g ? { ...g, permissions: permEdit } : g);
      setShowPermissions(false);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar los permisos');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleSaveTemp = async () => {
    if (!token || !group) return;
    setSavingTemp(true);
    try {
      await updateGroup(token, groupId, { tempMessageDuration: tempEdit });
      setGroup((g) => g ? { ...g, tempMessageDuration: tempEdit } : g);
      setShowTempMsg(false);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar los mensajes temporales');
    } finally {
      setSavingTemp(false);
    }
  };

  const handleRemoveMember = (member: ChatUser) => {
    if (!token || !group) return;
    Alert.alert(
      'Eliminar miembro',
      `¿Eliminar a ${member.name} del grupo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            setActionLoadingId(member._id);
            try {
              await removeGroupMember(token, groupId, member._id);
              setGroup((g) => g ? { ...g, participants: g.participants.filter((p) => p._id !== member._id) } : g);
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el miembro');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleOpenChat = async (member: ChatUser) => {
    if (!token) return;
    setMemberModal(null);
    setMemberActionLoading(true);
    try {
      const conv = await createOrGetConversation(token, member._id);
      router.push({ pathname: '/chat/[id]', params: { id: conv._id, name: member.name, avatar: member.avatar ?? '' } });
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleCallMember = async (member: ChatUser, callType: 'audio' | 'video') => {
    if (!token || callState !== 'idle') return;
    setMemberModal(null);
    setMemberActionLoading(true);
    try {
      const conv = await createOrGetConversation(token, member._id);
      await startCall({ peerId: member._id, peerName: member.name, peerAvatar: member.avatar, conversationId: conv._id, callType });
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleToggleAdmin = async (member: ChatUser) => {
    if (!token || !group) return;
    setMemberModal(null);
    setActionLoadingId(member._id);
    try {
      const { isAdmin } = await toggleGroupAdmin(token, groupId, member._id);
      setGroup((g) => {
        if (!g) return g;
        const admins = isAdmin
          ? [...(g.admins ?? []), member._id]
          : (g.admins ?? []).filter((a) => a !== member._id);
        return { ...g, admins };
      });
    } catch {
      Alert.alert('Error', 'No se pudo cambiar el rol');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAddSearch = useCallback(async (q: string) => {
    setAddSearch(q);
    if (q.length < 2) { setAddResults([]); return; }
    setAddSearching(true);
    try {
      const results = await searchUsers(token!, q);
      const existing = new Set(group?.participants.map((p) => p._id) ?? []);
      setAddResults(results.filter((u) => !existing.has(u._id)));
    } finally {
      setAddSearching(false);
    }
  }, [token, group]);

  const toggleAddSelect = (u: ChatUser) =>
    setAddSelected((prev) =>
      prev.some((s) => s._id === u._id)
        ? prev.filter((s) => s._id !== u._id)
        : [...prev, u]
    );

  const handleConfirmAddMembers = async () => {
    if (!token || addSelected.length === 0) return;
    setAddingMembers(true);
    try {
      await addGroupMembers(token, groupId, addSelected.map((u) => u._id));
      setGroup((g) => g ? { ...g, participants: [...g.participants, ...addSelected] } : g);
      setAddSelected([]);
      setAddSearch('');
      setAddResults([]);
      setShowAddMembers(false);
    } catch {
      Alert.alert('Error', 'No se pudieron añadir los miembros');
    } finally {
      setAddingMembers(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Salir del grupo', '¿Seguro que quieres salir de este grupo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await leaveGroup(token, groupId);
            archiveConversation(groupId);
            router.replace('/(tabs)/chats' as any);
          } catch {
            Alert.alert('Error', 'No se pudo salir del grupo');
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      '⚠️ Eliminar grupo permanentemente',
      'Esta acción es DEFINITIVA e IRRECUPERABLE. Se eliminará para TODOS los miembros:\n\n• Todos los mensajes del grupo\n• Todas las fotos, audios y archivos enviados\n• Las actividades espirituales y compromisos\n• Las peticiones de oración y sus imágenes\n• La foto del grupo\n\nNo existe ninguna forma de recuperar esta información una vez eliminada.',
      [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, eliminar grupo', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await deleteGroup(token, groupId);
            router.replace('/(tabs)/chats' as any);
          } catch {
            Alert.alert('Error', 'No se pudo eliminar el grupo');
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    Alert.alert('Reportar grupo', '¿Por qué quieres reportar este grupo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Contenido inapropiado', onPress: () => submitReport('Contenido inapropiado') },
      { text: 'Spam', onPress: () => submitReport('Spam') },
      { text: 'Acoso', onPress: () => submitReport('Acoso') },
    ]);
  };

  const submitReport = async (reason: string) => {
    if (!token) return;
    try {
      await reportGroup(token, groupId, reason);
      Alert.alert('Reporte enviado', 'Gracias por tu reporte. Lo revisaremos pronto.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar el reporte');
    }
  };

  const filteredMembers = useMemo(() => {
    if (!group) return [];
    if (!memberSearch.trim()) return group.participants;
    const q = memberSearch.toLowerCase();
    return group.participants.filter((p) => p.name.toLowerCase().includes(q));
  }, [group, memberSearch]);

  const adminIds = new Set<string>(group?.admins?.map((a) => String(a)) ?? []);

  const availableContacts = useMemo(() => {
    const existing = new Set(group?.participants.map((p) => p._id) ?? []);
    return contacts.filter((c) => !existing.has(c._id));
  }, [contacts, group]);

  const addListData = addSearch.length >= 2 ? addResults : availableContacts;

  const s = {
    card: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' as const, backgroundColor: colors.bgSecondary, marginBottom: 16 },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 16 },
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Grupo no encontrado</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Info del grupo</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar + Name */}
        <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 }}>
          <TouchableOpacity
            onPress={group.isAdmin ? handleChangeAvatar : undefined}
            activeOpacity={group.isAdmin ? 0.75 : 1}
          >
            {uploadingAvatar ? (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : group.groupAvatar ? (
              <Image source={{ uri: group.groupAvatar }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="user-friends" size={36} color="#fff" />
              </View>
            )}
            {group.isAdmin && (
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.onlineDot, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgPrimary }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>✏️</Text>
              </View>
            )}
          </TouchableOpacity>

          {editingName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
              <TextInput
                style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 'bold', textAlign: 'center', backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, minWidth: 160 }}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                maxLength={60}
                onSubmitEditing={handleSaveName}
              />
              {savingName ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <TouchableOpacity onPress={handleSaveName} style={{ padding: 4 }}>
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>✓</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={group.isAdmin ? () => setEditingName(true) : undefined}
              activeOpacity={group.isAdmin ? 0.7 : 1}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>{group.groupName}</Text>
              {group.isAdmin && <Text style={{ color: colors.textMuted, fontSize: 14 }}>✏️</Text>}
            </TouchableOpacity>
          )}

          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>
            Grupo · {group.participants.length} miembro{group.participants.length !== 1 ? 's' : ''}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Creado el {new Date(group.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 24, paddingHorizontal: 16 }}>
          <TouchableOpacity
            onPress={() => {
              if (!groupCallActive && callState === 'idle' && token) {
                startGroupCall(groupId, 'audio', token);
                router.back();
              }
            }}
            style={{ alignItems: 'center', gap: 8 }}
          >
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0891b2' }}>
              <Ionicons name="call" size={26} color="#fff" />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>Llamada{'\n'}de voz</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (!groupCallActive && callState === 'idle' && token) {
                startGroupCall(groupId, 'video', token);
                router.back();
              }
            }}
            style={{ alignItems: 'center', gap: 8 }}
          >
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDark }}>
              <Ionicons name="videocam" size={26} color="#fff" />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>Video{'\n'}llamada</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: '/group-prayer/[id]' as any, params: { id: groupId } })}
            style={{ alignItems: 'center', gap: 8 }}
          >
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <FontAwesome5 name="praying-hands" size={26} color="#fff" />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>Peticiones{'\n'}de oración</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: '/group-activities/[id]' as any, params: { id: groupId } })}
            style={{ alignItems: 'center', gap: 8 }}
          >
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7c3aed' }}>
              <Ionicons name="flame" size={26} color="#fff" />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>Actividades</Text>
          </TouchableOpacity>
        </View>

        {/* Settings rows */}
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={group.isAdmin ? () => { setTempEdit(group.tempMessageDuration ?? null); setShowTempMsg(true); } : undefined}>
            <Text style={{ fontSize: 20, marginRight: 16 }}>⏱️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Mensajes temporales</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{tempLabel(group.tempMessageDuration)}</Text>
            </View>
            {group.isAdmin && <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => router.push({ pathname: '/group-media/[id]' as any, params: { id: groupId } })}>
            <Text style={{ fontSize: 20, marginRight: 16 }}>📁</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Archivos, enlaces y docs</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.rowLast} onPress={group.isAdmin ? () => { setPermEdit(group.permissions ?? permEdit); setShowPermissions(true); } : undefined}>
            <Text style={{ fontSize: 20, marginRight: 16 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Restringir chat</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Permisos de miembros</Text>
            </View>
            {group.isAdmin && <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>}
          </TouchableOpacity>
        </View>

        {/* Members */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8 }}>
            {group.participants.length} miembro{group.participants.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={s.card}>
          {/* Search + Add button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.bgTertiary, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 }}
              placeholder="Buscar miembro..."
              placeholderTextColor={colors.inputPlaceholder}
              value={memberSearch}
              onChangeText={setMemberSearch}
            />
            {(group.isAdmin || group.permissions?.membersCanAddMembers) && (
              <TouchableOpacity
                onPress={() => { setAddSearch(''); setAddSelected([]); setAddResults([]); setShowAddMembers(true); }}
                style={{ backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>+ Añadir</Text>
              </TouchableOpacity>
            )}
          </View>

          {filteredMembers.map((member, idx) => {
            const isAdminM = adminIds.has(member._id);
            const isMe = member._id === user?.id;
            const isLoading = actionLoadingId === member._id;
            const isLast = idx === filteredMembers.length - 1;
            return (
              <TouchableOpacity
                key={member._id}
                onLongPress={() => !isMe && setMemberModal(member)}
                delayLongPress={350}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border }}
              >
                {member.avatar ? (
                  <Image source={{ uri: member.avatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: 'bold' }}>{member.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{member.name}</Text>
                    {isMe && <Text style={{ color: colors.textMuted, fontSize: 12 }}>(tú)</Text>}
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{member.email}</Text>
                </View>
                {isAdminM && (
                  <View style={{ backgroundColor: `${colors.accent}33`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 }}>
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Admin</Text>
                  </View>
                )}
                {group.isAdmin && !isMe && !isLoading && (
                  <TouchableOpacity onPress={() => handleRemoveMember(member)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                )}
                {isLoading && <ActivityIndicator size="small" color={colors.accent} />}
              </TouchableOpacity>
            );
          })}

          {filteredMembers.length === 0 && (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 16, fontSize: 14 }}>Sin resultados</Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleReport}>
            <Text style={{ fontSize: 20, marginRight: 16 }}>🚩</Text>
            <Text style={{ color: '#f59e0b', fontSize: 16 }}>Reportar grupo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.rowLast} onPress={handleLeave}>
            <Text style={{ fontSize: 20, marginRight: 16 }}>🚪</Text>
            <Text style={{ color: colors.danger, fontSize: 16 }}>Salir del grupo</Text>
          </TouchableOpacity>
        </View>

        {group.isAdmin && (
          <View style={{ ...s.card, marginBottom: 32 }}>
            <TouchableOpacity style={s.rowLast} onPress={handleDelete}>
              <MaterialIcons name="group-remove" size={22} color={colors.danger} style={{ marginRight: 14 }} />
              <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '600' }}>Eliminar grupo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modal: Restringir chat */}
      <Modal visible={showPermissions} animationType="slide" onRequestClose={() => setShowPermissions(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setShowPermissions(false)} style={{ marginRight: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Restringir chat</Text>
            <TouchableOpacity onPress={handleSavePerms} disabled={savingPerms}>
              {savingPerms
                ? <ActivityIndicator color={colors.accent} size="small" />
                : <Text style={{ color: colors.accent, fontWeight: '600' }}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
              Permisos de miembros
            </Text>
            <View style={{ ...s.card }}>
              {[
                { label: 'Enviar nuevos mensajes', sub: 'Los miembros pueden enviar mensajes en el grupo', key: 'membersCanSend' as const },
                { label: 'Añadir nuevos miembros', sub: 'Los miembros pueden añadir otras personas', key: 'membersCanAddMembers' as const },
                { label: 'Invitar con enlace o QR', sub: 'Los miembros pueden compartir el enlace de invitación', key: 'membersCanInvite' as const },
              ].map((item, idx, arr) => (
                <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{item.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Switch
                    value={permEdit[item.key]}
                    onValueChange={(v) => setPermEdit((p) => ({ ...p, [item.key]: v }))}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingBottom: 8 }}>
              Permisos de administrador
            </Text>
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Aprobar nuevos miembros</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Los administradores deben aprobar las solicitudes para unirse</Text>
                </View>
                <Switch
                  value={permEdit.requireAdminApproval}
                  onValueChange={(v) => setPermEdit((p) => ({ ...p, requireAdminApproval: v }))}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal: Mensajes temporales */}
      <Modal visible={showTempMsg} transparent animationType="slide" onRequestClose={() => setShowTempMsg(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowTempMsg(false)}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Mensajes temporales</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 16 }}>
                  Los mensajes se eliminarán automáticamente después del tiempo seleccionado.
                </Text>
                {TEMP_OPTIONS.map((opt) => {
                  const active = tempEdit === opt.value;
                  return (
                    <TouchableOpacity
                      key={String(opt.value)}
                      onPress={() => setTempEdit(opt.value)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginBottom: 8,
                        backgroundColor: active ? `${colors.accent}33` : colors.bgTertiary,
                        borderWidth: active ? 1 : 0,
                        borderColor: active ? colors.accent : 'transparent',
                      }}
                    >
                      <Text style={{ flex: 1, fontWeight: '500', color: active ? colors.accent : colors.textPrimary }}>{opt.label}</Text>
                      {active && <Text style={{ color: colors.accent }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={handleSaveTemp}
                  disabled={savingTemp}
                  style={{ marginTop: 8, marginBottom: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center' }}
                >
                  {savingTemp
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar</Text>
                  }
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Añadir miembros */}
      <Modal visible={showAddMembers} animationType="slide" onRequestClose={() => setShowAddMembers(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setShowAddMembers(false)} style={{ marginRight: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Añadir miembros</Text>
            {addSelected.length > 0 && (
              <TouchableOpacity onPress={handleConfirmAddMembers} disabled={addingMembers}>
                {addingMembers
                  ? <ActivityIndicator color={colors.accent} size="small" />
                  : <Text style={{ color: colors.accent, fontWeight: '600' }}>Añadir ({addSelected.length})</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {addSelected.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
              {addSelected.map((u) => (
                <TouchableOpacity
                  key={u._id}
                  onPress={() => toggleAddSelect(u)}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.accent}33`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12, marginRight: 4 }}>{u.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <TextInput
              style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 }}
              placeholder="Buscar por nombre o email..."
              placeholderTextColor={colors.inputPlaceholder}
              value={addSearch}
              onChangeText={handleAddSearch}
              autoFocus
            />
          </View>

          {addSearch.length >= 2 && addSearching ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
          ) : (
            <FlatList
              data={addListData}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => {
                const sel = addSelected.some((s) => s._id === item._id);
                return (
                  <Pressable
                    onPress={() => toggleAddSelect(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: 'bold' }}>{item.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{item.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{item.email}</Text>
                    </View>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: sel ? colors.onlineDot : colors.border, backgroundColor: sel ? colors.onlineDot : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32, paddingHorizontal: 32 }}>
                  {addSearch.length >= 2
                    ? 'Sin resultados'
                    : 'Contactos con los que has conversado'}
                </Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Member action modal */}
      <Modal
        visible={!!memberModal}
        transparent
        animationType="slide"
        onRequestClose={() => setMemberModal(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setMemberModal(null)}
        >
          <Pressable onPress={() => {}}>
            {memberModal && (() => {
              const isAdminM = adminIds.has(memberModal._id);
              const sheetBg = { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 };
              const row = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.borderLight };
              return (
                <View style={sheetBg}>
                  {/* Handle */}
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

                  {/* Profile header */}
                  <View style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    {memberModal.avatar ? (
                      <Image source={{ uri: memberModal.avatar }} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 10 }} />
                    ) : (
                      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <Text style={{ color: colors.accent, fontSize: 28, fontWeight: '700' }}>{memberModal.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{memberModal.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{memberModal.email}</Text>
                    {isAdminM && (
                      <View style={{ marginTop: 6, backgroundColor: `${colors.accent}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Administrador</Text>
                      </View>
                    )}
                  </View>

                  {/* Action buttons row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 12 }}>
                    {[
                      { icon: 'chatbubble', label: 'Mensaje', onPress: () => handleOpenChat(memberModal) },
                      { icon: 'call', label: 'Llamada', onPress: () => handleCallMember(memberModal, 'audio') },
                      { icon: 'videocam', label: 'Video', onPress: () => handleCallMember(memberModal, 'video') },
                    ].map(({ icon, label, onPress }) => (
                      <TouchableOpacity key={icon} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                          <Ionicons name={icon as any} size={22} color={colors.accent} />
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Admin toggle (solo para admins sobre otros miembros) */}
                  {group?.isAdmin && (
                    <TouchableOpacity style={row} onPress={() => handleToggleAdmin(memberModal)}>
                      <Ionicons name="shield-checkmark-outline" size={22} color={colors.accent} style={{ marginRight: 14 }} />
                      <Text style={{ color: colors.textPrimary, fontSize: 16 }}>
                        {isAdminM ? 'Quitar como administrador' : 'Designar como administrador'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Ver perfil */}
                  <TouchableOpacity
                    style={row}
                    onPress={() => { setMemberModal(null); router.push({ pathname: '/contact/[id]', params: { id: memberModal._id } }); }}
                  >
                    <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} style={{ marginRight: 14 }} />
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Ver perfil</Text>
                  </TouchableOpacity>

                  {/* Quitar del grupo (solo admin sobre no-admins) */}
                  {group?.isAdmin && (
                    <TouchableOpacity
                      style={{ ...row, borderBottomWidth: 0 }}
                      onPress={() => { setMemberModal(null); handleRemoveMember(memberModal); }}
                    >
                      <Ionicons name="person-remove-outline" size={22} color={colors.danger} style={{ marginRight: 14 }} />
                      <Text style={{ color: colors.danger, fontSize: 16 }}>Quitar del grupo</Text>
                    </TouchableOpacity>
                  )}

                  {/* Cancelar */}
                  <TouchableOpacity
                    onPress={() => setMemberModal(null)}
                    style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

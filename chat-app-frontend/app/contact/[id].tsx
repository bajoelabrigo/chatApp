import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  TextInput, Alert, Share, ActivityIndicator, Modal, Pressable, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useTheme } from '../../src/context/ThemeContext';
import {
  getUserProfile, reportUser, apiToggleFavorite, apiToggleBlock,
  apiToggleArchive, addGroupMembers, type ContactProfile,
} from '../../src/services/conversationService';

const nicknameKey = (uid: string) => `nickname_${uid}`;
const notesKey = (uid: string) => `notes_${uid}`;

export default function ContactInfoScreen() {
  const { colors, isDark } = useTheme();
  const { id: userId, conversationId } = useLocalSearchParams<{
    id: string;
    conversationId: string;
  }>();
  const { token } = useAuthStore();
  const { conversations, favoriteConversation, archiveConversation, blockConversation, unblockConversation } = useChatsStore();

  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [nickname, setNickname] = useState('');
  const [notes, setNotes] = useState('');

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState('');

  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);

  const conv = conversations.find((c) => c._id === conversationId);
  const isFavorite = conv?.isFavorite ?? false;

  const myGroups = conversations.filter(
    (c) => c.isGroup && c.participants.some((p) => p._id === userId) === false
  );

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const [data, savedNick, savedNotes] = await Promise.all([
        getUserProfile(token, userId),
        AsyncStorage.getItem(nicknameKey(userId)),
        AsyncStorage.getItem(notesKey(userId)),
      ]);
      setProfile(data);
      const nick = savedNick ?? '';
      setNickname(nick);
      setNicknameInput(nick);
      const n = savedNotes ?? '';
      setNotes(n);
      setNotesInput(n);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => { load(); }, [load]);

  const displayName = nickname || profile?.name || '';

  const saveNickname = async () => {
    const val = nicknameInput.trim();
    await AsyncStorage.setItem(nicknameKey(userId), val);
    setNickname(val);
    setEditingNickname(false);
  };

  const saveNotes = async () => {
    await AsyncStorage.setItem(notesKey(userId), notesInput);
    setNotes(notesInput);
    setEditingNotes(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar contacto',
      `¿Eliminar a ${displayName} de tus contactos? Se archivará la conversación.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await apiToggleArchive(token, conversationId);
              archiveConversation(conversationId);
              router.replace('/(tabs)/chats' as any);
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el contacto');
            }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = async () => {
    if (!token) return;
    try {
      const { favorited } = await apiToggleFavorite(token, conversationId);
      favoriteConversation(conversationId, favorited);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar favoritos');
    }
  };

  const handleToggleBlock = () => {
    const isBlocked = profile?.isBlocked ?? false;
    Alert.alert(
      isBlocked ? 'Desbloquear' : `Bloquear a ${displayName}`,
      isBlocked
        ? `¿Desbloquear a ${displayName}? Podrá volver a enviarte mensajes.`
        : `¿Bloquear a ${displayName}? No podrá enviarte mensajes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isBlocked ? 'Desbloquear' : 'Bloquear',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              const { blocked } = await apiToggleBlock(token, userId);
              setProfile((p) => p ? { ...p, isBlocked: blocked } : p);
              if (blocked) blockConversation(conversationId);
              else unblockConversation(conversationId);
            } catch {
              Alert.alert('Error', 'No se pudo completar la operación');
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    Alert.alert(
      `Reportar a ${displayName}`,
      '¿Por qué quieres reportar a este contacto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Contenido inapropiado', onPress: () => submitReport('Contenido inapropiado') },
        { text: 'Spam', onPress: () => submitReport('Spam') },
        { text: 'Acoso', onPress: () => submitReport('Acoso') },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    if (!token) return;
    try {
      await reportUser(token, userId, reason);
      Alert.alert('Reporte enviado', 'Gracias por tu reporte. Lo revisaremos pronto.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar el reporte');
    }
  };

  const handleShare = async () => {
    if (!profile) return;
    await Share.share({
      message: `${displayName}\n${profile.email}`,
      title: displayName,
    });
  };

  const handleAddToGroup = async (groupId: string) => {
    if (!token) return;
    setAddingToGroupId(groupId);
    try {
      await addGroupMembers(token, groupId, [userId]);
      Alert.alert('Listo', `${displayName} fue añadido al grupo.`);
      setShowAddToGroup(false);
    } catch {
      Alert.alert('Error', 'No se pudo añadir al grupo');
    } finally {
      setAddingToGroupId(null);
    }
  };

  const card = { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' as const, backgroundColor: colors.bgSecondary, marginBottom: 16 };
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border };
  const rowLast = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 16 };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>No se pudo cargar el perfil</Text>
      </SafeAreaView>
    );
  }

  const visibleGroups = showAllGroups
    ? profile.sharedGroups
    : profile.sharedGroups.slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Info del contacto</Text>
        <TouchableOpacity
          onPress={() => { setNicknameInput(nickname || profile.name); setEditingNickname(true); }}
          style={{ padding: 8 }}
        >
          <Ionicons name="pencil" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Avatar + name + email */}
        <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 }}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={{ width: 112, height: 112, borderRadius: 56 }} />
          ) : (
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textPrimary, fontSize: 48, fontWeight: 'bold' }}>
                {displayName[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}

          {editingNickname ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 }}>
              <TextInput
                style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 'bold', textAlign: 'center', backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, minWidth: 192 }}
                value={nicknameInput}
                onChangeText={setNicknameInput}
                autoFocus
                maxLength={60}
                onSubmitEditing={saveNickname}
                placeholder={profile.name}
                placeholderTextColor={colors.inputPlaceholder}
              />
              <TouchableOpacity onPress={saveNickname} style={{ padding: 4 }}>
                <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 18 }}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingNickname(false)} style={{ padding: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 'bold' }}>{displayName}</Text>
              {nickname ? (
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>(apodo)</Text>
              ) : null}
            </View>
          )}

          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>{profile.email}</Text>

          {profile.bio ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 }}>
              {profile.bio}
            </Text>
          ) : null}
        </View>

        {/* Delete contact */}
        <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={handleDelete}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: `${colors.danger}55`, gap: 8, backgroundColor: `${colors.danger}14` }}
          >
            <Ionicons name="person-remove" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, fontWeight: '600' }}>Eliminar contacto</Text>
          </TouchableOpacity>
        </View>

        {/* Notes */}
        <View style={card}>
          <TouchableOpacity onPress={() => { setNotesInput(notes); setEditingNotes(true); }} style={rowLast}>
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>
                {notes ? 'Notas' : 'Añadir nota'}
              </Text>
              {notes ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{notes}</Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Toca para añadir una nota personal</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Shared groups */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8 }}>
            {profile.sharedGroups.length} grupo{profile.sharedGroups.length !== 1 ? 's' : ''} en común
          </Text>
        </View>

        {profile.sharedGroups.length > 0 ? (
          <View style={card}>
            {visibleGroups.map((g, idx) => (
              <TouchableOpacity
                key={String(g._id)}
                onPress={() => router.push({ pathname: '/chat/[id]' as any, params: { id: g._id, name: g.groupName ?? 'Grupo', isGroup: '1', memberCount: String(g.participantCount) } })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: idx < visibleGroups.length - 1 ? 1 : 0, borderBottomColor: colors.border }}
              >
                {g.groupAvatar ? (
                  <Image source={{ uri: g.groupAvatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.accent}33`, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome5 name="user-friends" size={16} color={colors.accent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{g.groupName ?? 'Grupo'}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{g.participantCount} miembros</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            {profile.sharedGroups.length > 3 && !showAllGroups && (
              <TouchableOpacity
                onPress={() => setShowAllGroups(true)}
                style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '500' }}>
                  Ver todos ({profile.sharedGroups.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ ...card, paddingHorizontal: 16, paddingVertical: 16 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>Sin grupos en común</Text>
          </View>
        )}

        {/* Add to group */}
        {myGroups.length > 0 && (
          <View style={card}>
            <TouchableOpacity onPress={() => setShowAddToGroup(true)} style={rowLast}>
              <Ionicons name="person-add" size={20} color={colors.accent} style={{ marginRight: 12 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 }}>Añadir a un grupo</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Options */}
        <View style={card}>
          <TouchableOpacity onPress={handleShare} style={row}>
            <Ionicons name="share-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Compartir contacto</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleToggleFavorite} style={row}>
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={20}
              color={isFavorite ? '#f59e0b' : colors.textSecondary}
              style={{ marginRight: 12 }}
            />
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
              {isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleToggleBlock} style={row}>
            <Ionicons
              name={profile.isBlocked ? 'lock-open-outline' : 'ban-outline'}
              size={20}
              color={profile.isBlocked ? colors.accent : colors.danger}
              style={{ marginRight: 12 }}
            />
            <Text style={{ color: profile.isBlocked ? colors.accent : colors.danger, fontSize: 14 }}>
              {profile.isBlocked ? `Desbloquear a ${displayName}` : `Bloquear a ${displayName}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleReport} style={rowLast}>
            <Ionicons name="flag-outline" size={20} color="#f59e0b" style={{ marginRight: 12 }} />
            <Text style={{ color: '#f59e0b', fontSize: 14 }}>Reportar a {displayName}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Modal: Notes */}
      <Modal visible={editingNotes} transparent animationType="slide" onRequestClose={() => setEditingNotes(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setEditingNotes(false)}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', flex: 1 }}>Notas</Text>
                  <TouchableOpacity onPress={saveNotes}>
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={{ backgroundColor: colors.bgTertiary, color: colors.inputText, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, minHeight: 96, textAlignVertical: 'top' }}
                  placeholder="Escribe una nota personal sobre este contacto..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={notesInput}
                  onChangeText={setNotesInput}
                  multiline
                  autoFocus
                  maxLength={500}
                />
                <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 4 }}>{notesInput.length}/500</Text>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Add to group */}
      <Modal visible={showAddToGroup} transparent animationType="slide" onRequestClose={() => setShowAddToGroup(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowAddToGroup(false)}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 16 }}>Añadir a grupo</Text>
                {myGroups.map((g) => {
                  const alreadyIn = profile.sharedGroups.some((sg) => String(sg._id) === g._id);
                  const isLoading = addingToGroupId === g._id;
                  return (
                    <TouchableOpacity
                      key={g._id}
                      onPress={() => !alreadyIn && handleAddToGroup(g._id)}
                      disabled={alreadyIn || isLoading}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    >
                      {g.groupAvatar ? (
                        <Image source={{ uri: g.groupAvatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                      ) : (
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.accent}33`, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                          <FontAwesome5 name="user-friends" size={16} color={colors.accent} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '500', color: alreadyIn ? colors.textMuted : colors.textPrimary }}>
                          {g.groupName ?? 'Grupo'}
                        </Text>
                        {alreadyIn && (
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ya es miembro</Text>
                        )}
                      </View>
                      {isLoading
                        ? <ActivityIndicator size="small" color={colors.accent} />
                        : alreadyIn
                          ? <Ionicons name="checkmark" size={18} color={colors.textMuted} />
                          : <Ionicons name="add" size={20} color={colors.accent} />
                      }
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => setShowAddToGroup(false)}
                  style={{ marginTop: 12, marginBottom: 4, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

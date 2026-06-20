import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useTheme } from '../../src/context/ThemeContext';
import { signOutGoogle } from '../../src/services/googleSignIn';
import { uploadFile } from '../../src/services/uploadService';
import { getMyProfileApi, updateProfileApi, getSettingsApi, updateSettingsApi, changePasswordApi, deleteAccountApi } from '../../src/services/userService';
import type { NotificationSettings, PrivacySettings } from '../../src/store/useAuthStore';
import {
  getConversations,
  getArchivedConversations,
  getFavoriteConversations,
  getBlockedUsers,
  apiToggleArchive,
  apiToggleFavorite,
  apiToggleBlock,
  type Conversation,
  type BlockedUser,
} from '../../src/services/conversationService';
import {
  RINGTONE_OPTIONS,
  getSelectedRingtoneId,
  saveRingtonePreference,
  playRingtone,
  stop as stopRingtone,
} from '../../src/services/ringtoneService';

type Section = 'archivados' | 'favoritos' | 'bloqueados' | null;

const BIO_MAX = 150;
const DEFAULT_NOTIF: NotificationSettings = { messages: true, prayerRequests: true, activityReminders: true };
const DEFAULT_PRIVACY: PrivacySettings = { showOnlineStatus: true, showReadReceipts: true, showLastSeen: true };

export default function SettingsScreen() {
  const { user, logout, updateUser } = useAuthStore();
  const { token } = useAuthStore();
  const { colors, isDark, toggleTheme } = useTheme();
  const {
    archivedConversations, setArchivedConversations,
    setConversations,
    unarchiveConversation, unblockConversation, favoriteConversation,
  } = useChatsStore();

  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const handledSectionParam = useRef<string | null>(null);

  const [openSection, setOpenSection] = useState<Section>(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [archived, setArchived] = useState<Conversation[]>([]);
  const [favorites, setFavorites] = useState<Conversation[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  const [showRingtonePicker, setShowRingtonePicker] = useState(false);
  const [selectedRingtone, setSelectedRingtone] = useState(getSelectedRingtoneId());

  // ── Ajustes granulares ────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(
    user?.notificationSettings ?? DEFAULT_NOTIF
  );
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(
    user?.privacySettings ?? DEFAULT_PRIVACY
  );

  useEffect(() => {
    if (!token) return;
    getSettingsApi(token)
      .then(({ notificationSettings, privacySettings: ps }) => {
        setNotifSettings(notificationSettings);
        setPrivacySettings(ps);
      })
      .catch(() => {});
  }, [token]);

  const toggleNotif = async (key: keyof NotificationSettings) => {
    if (!token) return;
    const next = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(next);
    try {
      await updateSettingsApi(token, { notificationSettings: { [key]: next[key] } });
    } catch {
      setNotifSettings((prev) => ({ ...prev, [key]: !next[key] }));
    }
  };

  const togglePrivacy = async (key: keyof PrivacySettings) => {
    if (!token) return;
    const next = { ...privacySettings, [key]: !privacySettings[key] };
    setPrivacySettings(next);
    try {
      await updateSettingsApi(token, { privacySettings: { [key]: next[key] } });
    } catch {
      setPrivacySettings((prev) => ({ ...prev, [key]: !next[key] }));
    }
  };
  // ──────────────────────────────────────────────────────

  // ── Editar perfil ──────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
  const [editAuthProvider, setEditAuthProvider] = useState<'google' | 'email' | undefined>(undefined);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const openEditProfile = async () => {
    if (!token) return;
    setEditName(user?.name ?? '');
    setEditBio(user?.bio ?? '');
    setEditAvatar(user?.avatar);
    setEditAuthProvider(user?.authProvider);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setEditOpen(true);
    try {
      const fresh = await getMyProfileApi(token);
      setEditBio(fresh.bio ?? '');
      setEditAuthProvider(fresh.authProvider);
      await updateUser({ bio: fresh.bio, authProvider: fresh.authProvider });
    } catch {
      // usa el valor del store si falla
    }
  };

  const pickAvatar = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el acceso a la galería en Ajustes.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadFile(token, asset.uri, asset.mimeType ?? 'image/jpeg', asset.uri.split('/').pop() ?? 'avatar.jpg');
      setEditAvatar(uploaded.url);
    } catch {
      Alert.alert('Error', 'No se pudo subir la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Completa todos los campos de contraseña');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas nuevas no coinciden');
      return;
    }
    setChangingPassword(true);
    try {
      await changePasswordApi(token, { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Listo', 'Contraseña actualizada correctamente');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'No se pudo cambiar la contraseña';
      Alert.alert('Error', msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Eliminar cuenta permanentemente',
      'Esto eliminará de forma DEFINITIVA e IRRECUPERABLE:\n\n• Tu perfil y foto\n• Todos tus mensajes y conversaciones\n• Tus actividades espirituales y compromisos\n• Tus peticiones de oración\n• Todos tus archivos e imágenes\n\nNo existe ninguna forma de recuperar esta información una vez eliminada.\n\nRecibirás un correo de confirmación en tu email.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Entiendo, continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmación final',
              `¿Confirmas que quieres eliminar la cuenta de ${user?.email ?? 'tu usuario'} de forma definitiva?\n\nEsta acción NO tiene marcha atrás.`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Sí, eliminar mi cuenta',
                  style: 'destructive',
                  onPress: async () => {
                    if (!token) return;
                    setDeletingAccount(true);
                    try {
                      await deleteAccountApi(token);
                      await signOutGoogle();
                      await logout();
                      router.replace('/(auth)/sign-in');
                    } catch {
                      Alert.alert('Error', 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const saveProfile = async () => {
    if (!token) return;
    const trimmedName = editName.trim();
    if (!trimmedName) { Alert.alert('Error', 'El nombre no puede estar vacío'); return; }
    setSaving(true);
    try {
      const updated = await updateProfileApi(token, {
        name: trimmedName,
        bio: editBio.trim(),
        avatar: editAvatar,
      });
      await updateUser({ name: updated.name, bio: updated.bio, avatar: updated.avatar });
      setEditOpen(false);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };
  // ──────────────────────────────────────────────────────

  const openSection_ = useCallback(async (section: Section) => {
    if (!token) return;
    setOpenSection(section);
    setLoading(true);
    try {
      if (section === 'archivados') {
        const data = await getArchivedConversations(token);
        setArchived(data.filter((c) => !c.isBlocked));
        setArchivedConversations(data);
      } else if (section === 'favoritos') {
        const data = await getFavoriteConversations(token);
        setFavorites(data);
      } else if (section === 'bloqueados') {
        const data = await getBlockedUsers(token);
        setBlocked(data);
      }
    } finally {
      setLoading(false);
    }
  }, [token, setArchivedConversations]);

  useEffect(() => {
    if (
      sectionParam &&
      sectionParam !== handledSectionParam.current &&
      (sectionParam === 'archivados' || sectionParam === 'favoritos' || sectionParam === 'bloqueados')
    ) {
      handledSectionParam.current = sectionParam;
      openSection_(sectionParam as Section);
    }
  }, [sectionParam]);

  const otherName = (conv: Conversation) =>
    conv.participants.find((p) => p._id !== user?.id)?.name ?? 'Usuario';
  const otherAvatar = (conv: Conversation) =>
    conv.participants.find((p) => p._id !== user?.id)?.avatar;

  const handleUnarchive = async (conv: Conversation) => {
    if (!token) return;
    setActionId(conv._id);
    try {
      await apiToggleArchive(token, conv._id);
      unarchiveConversation(conv._id);
      setArchived((prev) => prev.filter((c) => c._id !== conv._id));
    } catch {
      Alert.alert('Error', 'No se pudo desarchivar');
    } finally {
      setActionId(null);
    }
  };

  const handleRemoveFavorite = async (conv: Conversation) => {
    if (!token) return;
    setActionId(conv._id);
    try {
      await apiToggleFavorite(token, conv._id);
      favoriteConversation(conv._id, false);
      setFavorites((prev) => prev.filter((c) => c._id !== conv._id));
    } catch {
      Alert.alert('Error', 'No se pudo quitar de favoritos');
    } finally {
      setActionId(null);
    }
  };

  const handleUnblock = async (blockedUser: BlockedUser) => {
    if (!token) return;
    Alert.alert('Desbloquear usuario', `¿Desbloquear a ${blockedUser.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: async () => {
          setActionId(blockedUser._id);
          try {
            await apiToggleBlock(token, blockedUser._id);
            const conv = archivedConversations.find((c) =>
              c.participants.some((p) => p._id === blockedUser._id)
            );
            if (conv) {
              unblockConversation(conv._id);
            } else {
              const fresh = await getConversations(token);
              setConversations(fresh);
            }
            setBlocked((prev) => prev.filter((u) => u._id !== blockedUser._id));
          } catch {
            Alert.alert('Error', 'No se pudo desbloquear');
          } finally {
            setActionId(null);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión', style: 'destructive',
        onPress: async () => {
          await signOutGoogle();
          await logout();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  };

  const sectionTitle =
    openSection === 'archivados' ? 'Archivados'
    : openSection === 'favoritos' ? 'Favoritos'
    : 'Bloqueados';

  const cardStyle = {
    marginTop: 16, marginHorizontal: 16, borderRadius: 16,
    overflow: 'hidden' as const, backgroundColor: colors.bgSecondary,
    borderWidth: 1, borderColor: colors.border,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Perfil ── */}
        <TouchableOpacity
          onPress={openEditProfile}
          activeOpacity={0.75}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 18,
            backgroundColor: colors.headerBg,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}
        >
          {/* Avatar */}
          <View style={{ position: 'relative', marginRight: 16 }}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={{ width: 68, height: 68, borderRadius: 34 }} />
            ) : (
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold' }}>
                  {user?.name?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: 11,
              backgroundColor: colors.accent,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: colors.headerBg,
            }}>
              <Ionicons name="pencil" size={11} color="#fff" />
            </View>
          </View>

          {/* Datos */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>{user?.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 1 }}>{user?.email}</Text>
            {user?.bio ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, fontStyle: 'italic' }} numberOfLines={2}>
                {user.bio}
              </Text>
            ) : (
              <Text style={{ color: colors.accent, fontSize: 13, marginTop: 4 }}>
                Añadir estado...
              </Text>
            )}
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ── Apariencia ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Apariencia
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 20, marginRight: 14 }}>{isDark ? '🌙' : '☀️'}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>
              {isDark ? 'Modo oscuro' : 'Modo claro'}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={isDark ? colors.accentText : '#F5F5F5'}
            />
          </View>
        </View>

        {/* ── Notificaciones ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Notificaciones
          </Text>
          <SwitchRow
            icon="💬" label="Mensajes" sub="Notificaciones de mensajes nuevos"
            value={notifSettings.messages}
            onToggle={() => toggleNotif('messages')}
            colors={colors}
          />
          <SwitchRow
            icon="🙏" label="Peticiones de oración" sub="Cuando alguien comparte una oración"
            value={notifSettings.prayerRequests}
            onToggle={() => toggleNotif('prayerRequests')}
            colors={colors}
          />
          <SwitchRow
            icon="⏰" label="Recordatorios de actividad" sub="Avisos de horario de oración"
            value={notifSettings.activityReminders}
            onToggle={() => toggleNotif('activityReminders')}
            colors={colors}
            last
          />
        </View>

        {/* ── Tono de llamada ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Llamadas
          </Text>
          <TouchableOpacity
            onPress={() => setShowRingtonePicker(true)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ fontSize: 20, marginRight: 14 }}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Tono de llamada</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {RINGTONE_OPTIONS.find(r => r.id === selectedRingtone)?.label ?? 'Tono clásico'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Privacidad de cuenta ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Privacidad
          </Text>
          <SwitchRow
            icon="🟢" label="Estado en línea" sub="Mostrar cuando estás conectado"
            value={privacySettings.showOnlineStatus}
            onToggle={() => togglePrivacy('showOnlineStatus')}
            colors={colors}
          />
          <SwitchRow
            icon="✓✓" label="Confirmaciones de lectura" sub="Enviar cuando lees un mensaje"
            value={privacySettings.showReadReceipts}
            onToggle={() => togglePrivacy('showReadReceipts')}
            colors={colors}
          />
          <SwitchRow
            icon="🕐" label="Última vez" sub="Mostrar cuándo estuviste activo"
            value={privacySettings.showLastSeen}
            onToggle={() => togglePrivacy('showLastSeen')}
            colors={colors}
            last
          />
        </View>

        {/* ── Mis datos ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Mis datos
          </Text>
          <SectionRow icon="📂" label="Archivados" onPress={() => openSection_('archivados')} colors={colors} />
          <SectionRow icon="⭐" label="Favoritos" onPress={() => openSection_('favoritos')} colors={colors} />
          <SectionRow icon="🚫" label="Bloqueados" onPress={() => openSection_('bloqueados')} colors={colors} last />
        </View>

        {/* ── Información ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Información
          </Text>
          <SectionRow icon="📜" label="Reglamentos" onPress={() => router.push('/info/reglamentos' as any)} colors={colors} />
          <SectionRow icon="❓" label="Preguntas frecuentes" onPress={() => router.push('/info/faq' as any)} colors={colors} />
          <SectionRow icon="✝️" label="Quiénes somos" onPress={() => router.push('/info/quienes-somos' as any)} colors={colors} />
          <SectionRow icon="📧" label="Contacto" onPress={() => router.push('/info/contacto' as any)} colors={colors} last />
        </View>

        {/* ── Cuenta ── */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            Cuenta
          </Text>
          <TouchableOpacity
            onPress={handleLogout}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text style={{ fontSize: 20, marginRight: 14 }}>🚪</Text>
            <Text style={{ color: colors.danger, fontSize: 16, flex: 1 }}>Cerrar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, opacity: deletingAccount ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 20, marginRight: 14 }}>🗑️</Text>
            {deletingAccount
              ? <ActivityIndicator color={colors.danger} style={{ flex: 1 }} />
              : <Text style={{ color: colors.danger, fontSize: 16, flex: 1 }}>Eliminar cuenta</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Modal: editar perfil ── */}
      <Modal visible={editOpen} animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.bgPrimary }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: colors.border,
              backgroundColor: colors.headerBg,
            }}>
              <TouchableOpacity onPress={() => setEditOpen(false)} style={{ marginRight: 12, padding: 4 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 24 }}>←</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>
                Editar perfil
              </Text>
              <TouchableOpacity
                onPress={saveProfile}
                disabled={saving}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8,
                  borderRadius: 20, backgroundColor: colors.accent,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Guardar</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Avatar */}
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} disabled={uploadingAvatar}>
                  <View style={{ position: 'relative' }}>
                    {editAvatar ? (
                      <Image source={{ uri: editAvatar }} style={{ width: 100, height: 100, borderRadius: 50 }} />
                    ) : (
                      <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 36, fontWeight: 'bold' }}>
                          {editName?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                    <View style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: colors.accent,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2.5, borderColor: colors.bgPrimary,
                    }}>
                      {uploadingAvatar
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="camera" size={16} color="#fff" />}
                    </View>
                  </View>
                </TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10 }}>
                  Toca para cambiar la foto
                </Text>
              </View>

              {/* Campos */}
              <View style={{ marginHorizontal: 16, gap: 16 }}>
                {/* Nombre */}
                <View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Nombre
                  </Text>
                  <View style={{
                    borderRadius: 12, backgroundColor: colors.inputBg,
                    borderWidth: 1, borderColor: colors.border,
                    paddingHorizontal: 14, paddingVertical: 12,
                  }}>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      style={{ color: colors.inputText, fontSize: 16 }}
                      placeholder="Tu nombre"
                      placeholderTextColor={colors.inputPlaceholder}
                      maxLength={60}
                    />
                  </View>
                </View>

                {/* Bio / Estado */}
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Estado
                    </Text>
                    <Text style={{ color: editBio.length >= BIO_MAX ? colors.danger : colors.textMuted, fontSize: 11 }}>
                      {editBio.length}/{BIO_MAX}
                    </Text>
                  </View>
                  <View style={{
                    borderRadius: 12, backgroundColor: colors.inputBg,
                    borderWidth: 1, borderColor: colors.border,
                    paddingHorizontal: 14, paddingVertical: 12,
                  }}>
                    <TextInput
                      value={editBio}
                      onChangeText={(t) => setEditBio(t.slice(0, BIO_MAX))}
                      style={{ color: colors.inputText, fontSize: 16, minHeight: 80 }}
                      placeholder="Escribe algo sobre ti..."
                      placeholderTextColor={colors.inputPlaceholder}
                      multiline
                      maxLength={BIO_MAX}
                    />
                  </View>
                </View>

                {/* Email (solo lectura) */}
                <View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Email
                  </Text>
                  <View style={{
                    borderRadius: 12, backgroundColor: colors.bgTertiary,
                    borderWidth: 1, borderColor: colors.border,
                    paddingHorizontal: 14, paddingVertical: 14,
                    flexDirection: 'row', alignItems: 'center',
                  }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 16, flex: 1 }}>{user?.email}</Text>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                    El email no se puede cambiar
                  </Text>
                </View>

                {/* Cambiar contraseña */}
                <View style={{ marginTop: 8 }}>
                  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 20 }} />
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                    Cambiar contraseña
                  </Text>
                  {editAuthProvider === 'google' ? (
                    <View style={{ borderRadius: 12, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="logo-google" size={18} color={colors.textMuted} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
                        Tu cuenta usa Google Sign-In. Cambia tu contraseña desde tu cuenta de Google.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      <View style={{ borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <TextInput
                          value={currentPassword}
                          onChangeText={setCurrentPassword}
                          style={{ color: colors.inputText, fontSize: 16 }}
                          placeholder="Contraseña actual"
                          placeholderTextColor={colors.inputPlaceholder}
                          secureTextEntry
                        />
                      </View>
                      <View style={{ borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <TextInput
                          value={newPassword}
                          onChangeText={setNewPassword}
                          style={{ color: colors.inputText, fontSize: 16 }}
                          placeholder="Nueva contraseña"
                          placeholderTextColor={colors.inputPlaceholder}
                          secureTextEntry
                        />
                      </View>
                      <View style={{ borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <TextInput
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          style={{ color: colors.inputText, fontSize: 16 }}
                          placeholder="Confirmar nueva contraseña"
                          placeholderTextColor={colors.inputPlaceholder}
                          secureTextEntry
                        />
                      </View>
                      <TouchableOpacity
                        onPress={handleChangePassword}
                        disabled={changingPassword}
                        style={{
                          borderRadius: 12, paddingVertical: 14,
                          backgroundColor: colors.bgSecondary,
                          borderWidth: 1, borderColor: colors.accent,
                          alignItems: 'center',
                          opacity: changingPassword ? 0.6 : 1,
                        }}
                      >
                        {changingPassword
                          ? <ActivityIndicator color={colors.accent} />
                          : <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 15 }}>Actualizar contraseña</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              {/* Vuélvete Sembrador */}
              <TouchableOpacity
                onPress={() => { setEditOpen(false); router.push('/(tabs)/ofrendas' as any); }}
                style={{
                  marginHorizontal: 16, marginTop: 28, marginBottom: 8,
                  borderRadius: 16, paddingVertical: 16,
                  backgroundColor: colors.accent,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 10,
                }}
              >
                <Ionicons name="heart" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Vuélvete Sembrador</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
                Apoya la comunidad con una ofrenda
              </Text>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: selector de tono ── */}
      <Modal visible={showRingtonePicker} transparent animationType="slide" onRequestClose={() => { stopRingtone(); setShowRingtonePicker(false); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => { stopRingtone(); setShowRingtonePicker(false); }}>
          <Pressable onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>🔔 Tono de llamada</Text>
                {RINGTONE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    onPress={async () => {
                      setSelectedRingtone(option.id);
                      await saveRingtonePreference(option.id);
                      playRingtone();
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <Ionicons
                      name={selectedRingtone === option.id ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selectedRingtone === option.id ? colors.accent : colors.textMuted}
                      style={{ marginRight: 14 }}
                    />
                    <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>{option.label}</Text>
                    {selectedRingtone === option.id && (
                      <Ionicons name="musical-note" size={18} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => { stopRingtone(); setShowRingtonePicker(false); }}
                  style={{ marginTop: 16, marginBottom: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Listo</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal: secciones (archivados / favoritos / bloqueados) ── */}
      <Modal visible={!!openSection} animationType="slide" onRequestClose={() => setOpenSection(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.headerBg }}>
            <TouchableOpacity onPress={() => setOpenSection(null)} style={{ marginRight: 12, padding: 4 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 24 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>{sectionTitle}</Text>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <>
              {openSection === 'archivados' && (
                <FlatList
                  style={{ backgroundColor: colors.bgPrimary }}
                  data={archived}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => (
                    <ConvRow
                      name={otherName(item)}
                      avatar={otherAvatar(item)}
                      sub={lastMsgPreview(item)}
                      loading={actionId === item._id}
                      actionLabel="Desarchivar"
                      actionColor={colors.accent}
                      onAction={() => handleUnarchive(item)}
                      onOpen={() => {
                        setOpenSection(null);
                        const other = item.participants.find((p) => p._id !== user?.id);
                        if (other) router.push({ pathname: '/chat/[id]' as any, params: { id: item._id, name: other.name, avatar: other.avatar ?? '' } });
                      }}
                      colors={colors}
                    />
                  )}
                  ListEmptyComponent={<EmptyLabel text="No hay conversaciones archivadas" colors={colors} />}
                />
              )}

              {openSection === 'favoritos' && (
                <FlatList
                  style={{ backgroundColor: colors.bgPrimary }}
                  data={favorites}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => (
                    <ConvRow
                      name={otherName(item)}
                      avatar={otherAvatar(item)}
                      sub={lastMsgPreview(item)}
                      loading={actionId === item._id}
                      actionLabel="Quitar"
                      actionColor="#FBBF24"
                      onAction={() => handleRemoveFavorite(item)}
                      onOpen={() => {
                        setOpenSection(null);
                        const other = item.participants.find((p) => p._id !== user?.id);
                        if (other) router.push({ pathname: '/chat/[id]' as any, params: { id: item._id, name: other.name, avatar: other.avatar ?? '' } });
                      }}
                      colors={colors}
                    />
                  )}
                  ListEmptyComponent={<EmptyLabel text="No tienes conversaciones favoritas" colors={colors} />}
                />
              )}

              {openSection === 'bloqueados' && (
                <FlatList
                  style={{ backgroundColor: colors.bgPrimary }}
                  data={blocked}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => (
                    <UserRow user={item} loading={actionId === item._id} onUnblock={() => handleUnblock(item)} colors={colors} />
                  )}
                  ListEmptyComponent={<EmptyLabel text="No has bloqueado a nadie" colors={colors} />}
                />
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function lastMsgPreview(conv: Conversation): string {
  const lm = conv.lastMessage;
  if (!lm) return '';
  if (lm.isDeletedForEveryone) return '🚫 Mensaje eliminado';
  if (lm.type === 'image') return '📷 Imagen';
  if (lm.type === 'audio') return '🎤 Nota de voz';
  if (lm.type === 'document') return `📎 ${lm.fileName ?? 'Documento'}`;
  return lm.content;
}

function SwitchRow({ icon, label, sub, value, onToggle, colors, last }: {
  icon: string; label: string; sub: string; value: boolean;
  onToggle: () => void; colors: any; last?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
    }}>
      <Text style={{ fontSize: 20, marginRight: 14 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={value ? colors.accentText : '#F5F5F5'}
      />
    </View>
  );
}

function SectionRow({ icon, label, onPress, colors, last }: {
  icon: string; label: string; onPress: () => void; colors: any; last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 20, marginRight: 14 }}>{icon}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );
}

function EmptyLabel({ text, colors }: { text: string; colors: any }) {
  return <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 }}>{text}</Text>;
}

function ConvRow({ name, avatar, sub, loading, actionLabel, actionColor, onAction, onOpen, colors }: {
  name: string; avatar?: string; sub: string; loading: boolean;
  actionLabel: string; actionColor: string; onAction: () => void; onOpen: () => void; colors: any;
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      {avatar ? (
        <Image source={{ uri: avatar }} style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }} />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 16 }}>{name[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{sub}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <TouchableOpacity
          onPress={onAction}
          style={{ marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.bgTertiary }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: actionColor }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </Pressable>
  );
}

function UserRow({ user: blockedUser, loading, onUnblock, colors }: {
  user: BlockedUser; loading: boolean; onUnblock: () => void; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {blockedUser.avatar ? (
        <Image source={{ uri: blockedUser.avatar }} style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }} />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.avatarBg, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 16 }}>{blockedUser.name[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{blockedUser.name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{blockedUser.email}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <TouchableOpacity
          onPress={onUnblock}
          style={{ marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.bgTertiary }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Desbloquear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

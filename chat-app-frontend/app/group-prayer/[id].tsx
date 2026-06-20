import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
  Switch,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useActivitiesStore } from '../../src/store/useActivitiesStore';
import { useTheme } from '../../src/context/ThemeContext';
import { uploadFile } from '../../src/services/uploadService';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import {
  getPrayerRequests,
  createPrayerRequest,
  togglePray,
  markAnswered,
  deletePrayerRequest,
  editPrayerRequest,
  type PrayerRequest,
  type PrayingUser,
} from '../../src/services/activityService';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function PrayingUserChip({
  pu,
  onPress,
  colors,
}: {
  pu: PrayingUser;
  onPress: (pu: PrayingUser) => void;
  colors: any;
}) {
  const name = pu.userId?.name ?? 'Miembro';
  const initial = name[0]?.toUpperCase() ?? '?';
  return (
    <TouchableOpacity
      onPress={() => onPress(pu)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgTertiary, borderRadius: 999, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6 }}
    >
      {pu.userId?.avatar ? (
        <Image source={{ uri: pu.userId.avatar }} style={{ width: 20, height: 20, borderRadius: 10 }} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 9, color: colors.textPrimary, fontWeight: '700' }}>{initial}</Text>
        </View>
      )}
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{name}</Text>
      {pu.message ? (
        <FontAwesome5 name="comment" size={9} color="#86efac" solid />
      ) : null}
    </TouchableOpacity>
  );
}

function RequestCard({
  request,
  currentUserId,
  isAdmin,
  onTogglePray,
  onMarkAnswered,
  onDelete,
  onEdit,
  onViewPrayer,
  colors,
}: {
  request: PrayerRequest;
  currentUserId: string;
  isAdmin: boolean;
  onTogglePray: (id: string) => void;
  onMarkAnswered: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (request: PrayerRequest) => void;
  onViewPrayer: (pu: PrayingUser) => void;
  colors: any;
}) {
  const authorName = request.isAnonymous
    ? 'Anónimo'
    : (request.authorId as any)?.name ?? 'Miembro';

  const prayingUsers = request.prayingUsers ?? [];

  return (
    <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{authorName}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatDate(request.createdAt)}</Text>
      </View>

      <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: request.imageUrl || request.deadline ? 10 : 12 }}>{request.content}</Text>

      {request.imageUrl ? (
        <Image
          source={{ uri: request.imageUrl }}
          style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 10 }}
          resizeMode="cover"
        />
      ) : null}

      {request.deadline ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Hasta el {formatDate(request.deadline)}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TouchableOpacity
          onPress={() => onTogglePray(request._id)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1,
            backgroundColor: request.isPraying ? 'rgba(34,197,94,0.2)' : colors.bgTertiary,
            borderColor: request.isPraying ? '#16a34a' : colors.border,
          }}
        >
          <FontAwesome5 name="praying-hands" size={12} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            {request.prayingCount > 0 ? `${request.prayingCount} · ` : ''}
            {request.isPraying ? 'Orando' : 'Estoy orando'}
          </Text>
        </TouchableOpacity>

        {(request.isMyRequest || isAdmin) && !request.isAnswered && (
          <TouchableOpacity
            onPress={() => onMarkAnswered(request._id)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>✅ Respondida</Text>
          </TouchableOpacity>
        )}

        {(request.isMyRequest || isAdmin) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
            {!request.isAnswered && (
              <TouchableOpacity onPress={() => onEdit(request)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <FontAwesome5 name="pencil-alt" size={13} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onDelete(request._id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="trash" size={13} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {prayingUsers.length > 0 && (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            {prayingUsers.length} persona{prayingUsers.length !== 1 ? 's' : ''} orando · toca para ver mensaje
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {prayingUsers.map((pu, i) => (
              <PrayingUserChip key={pu.userId?._id ?? i} pu={pu} onPress={onViewPrayer} colors={colors} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function GroupPrayerScreen() {
  const { colors, isDark } = useTheme();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuthStore();
  const userId = user?.id;
  const { prayerRequests, setPrayerRequests, bindPrayerEvents, unbindPrayerEvents } = useActivitiesStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAnswered, setShowAnswered] = useState(false);
  const [answeredRequests, setAnsweredRequests] = useState<PrayerRequest[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newDeadline, setNewDeadline] = useState<string | undefined>(undefined);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [newImage, setNewImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [isAnon, setIsAnon] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState<string | null>(null);
  const [answerNote, setAnswerNote] = useState('');
  const [prayModalFor, setPrayModalFor] = useState<string | null>(null);
  const [prayMessage, setPrayMessage] = useState('');
  const [prayPosting, setPrayPosting] = useState(false);
  const [selectedPrayer, setSelectedPrayer] = useState<PrayingUser | null>(null);
  const [editModalFor, setEditModalFor] = useState<{ id: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDeadline, setEditDeadline] = useState<string | undefined>(undefined);
  const [showEditDeadlinePicker, setShowEditDeadlinePicker] = useState(false);
  const [editImage, setEditImage] = useState<ImagePicker.ImagePickerAsset | null>(null); // foto nueva
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null); // foto actual (url) o null si se quitó
  const [editIsAnon, setEditIsAnon] = useState(false);
  const [editPosting, setEditPosting] = useState(false);

  const open = prayerRequests[groupId] ?? [];

  useFocusEffect(
    useCallback(() => {
      if (!token || !groupId) return;
      (async () => {
        try {
          const [reqs, { getGroupInfo }] = await Promise.all([
            getPrayerRequests(token, groupId, false),
            import('../../src/services/conversationService'),
          ]);
          setPrayerRequests(groupId, reqs);
          const info = await getGroupInfo(token, groupId);
          setIsAdmin(info.isAdmin);
        } catch {
          Alert.alert('Error', 'No se pudieron cargar las peticiones');
        } finally {
          setLoading(false);
        }
      })();

      bindPrayerEvents(groupId, userId!);
      return () => unbindPrayerEvents();
    }, [groupId, token, userId])
  );

  async function loadAnswered() {
    if (!token) return;
    try {
      const reqs = await getPrayerRequests(token, groupId, true);
      setAnsweredRequests(reqs);
      setShowAnswered(true);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las peticiones respondidas');
    }
  }

  function handleTogglePray(requestId: string) {
    const req = open.find((r) => r._id === requestId);
    if (!req) return;
    if (req.isPraying) {
      submitPray(requestId, undefined);
    } else {
      setPrayModalFor(requestId);
      setPrayMessage('');
    }
  }

  async function submitPray(requestId: string, message: string | undefined) {
    if (!token) return;
    setPrayPosting(true);
    try {
      const result = await togglePray(token, groupId, requestId, message);
      setPrayerRequests(
        groupId,
        open.map((r) =>
          r._id === requestId
            ? { ...r, prayingCount: result.prayingCount, isPraying: result.isPraying, prayingUsers: result.prayingUsers }
            : r
        )
      );
    } catch {
      Alert.alert('Error', 'No se pudo actualizar');
    } finally {
      setPrayPosting(false);
      setPrayModalFor(null);
      setPrayMessage('');
    }
  }

  async function handleMarkAnswered(requestId: string) {
    setShowAnswerModal(requestId);
    setAnswerNote('');
  }

  async function confirmMarkAnswered() {
    if (!token || !showAnswerModal) return;
    try {
      await markAnswered(token, groupId, showAnswerModal, answerNote.trim() || undefined);
      setPrayerRequests(groupId, open.filter((r) => r._id !== showAnswerModal));
      setShowAnswerModal(null);
    } catch {
      Alert.alert('Error', 'No se pudo marcar como respondida');
    }
  }

  async function handleDelete(requestId: string) {
    Alert.alert('¿Eliminar petición?', '', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePrayerRequest(token!, groupId, requestId);
            setPrayerRequests(groupId, open.filter((r) => r._id !== requestId));
          } catch {
            Alert.alert('Error', 'No se pudo eliminar');
          }
        },
      },
    ]);
  }

  async function handleDeleteAnswered(requestId: string) {
    Alert.alert('¿Eliminar petición respondida?', '', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePrayerRequest(token!, groupId, requestId);
            setAnsweredRequests((prev) => prev.filter((r) => r._id !== requestId));
          } catch {
            Alert.alert('Error', 'No se pudo eliminar');
          }
        },
      },
    ]);
  }

  function handleEditRequest(request: PrayerRequest) {
    setEditModalFor({ id: request._id });
    setEditContent(request.content);
    setEditDeadline(request.deadline ?? undefined);
    setEditIsAnon(!!request.isAnonymous);
    setEditImageUrl(request.imageUrl ?? null);
    setEditImage(null);
  }

  function resetEditModal() {
    setEditModalFor(null);
    setEditImage(null);
    setEditImageUrl(null);
    setEditDeadline(undefined);
    setEditIsAnon(false);
  }

  async function confirmEdit() {
    if (!token || !editModalFor || !editContent.trim()) return;
    setEditPosting(true);
    try {
      let imageUrl: string | null = editImageUrl; // foto actual (o null si se quitó)
      let cloudinaryPublicId: string | undefined;
      if (editImage) {
        setUploadingImage(true);
        const ext = editImage.uri.split('.').pop() ?? 'jpg';
        const mimeType = editImage.mimeType ?? `image/${ext}`;
        const result = await uploadFile(token, editImage.uri, mimeType, `prayer_${Date.now()}.${ext}`);
        imageUrl = result.url;
        cloudinaryPublicId = result.publicId;
        setUploadingImage(false);
      }

      const payload = {
        content: editContent.trim(),
        isAnonymous: editIsAnon,
        deadline: editDeadline ?? null,
        imageUrl: imageUrl ?? null,
        ...(cloudinaryPublicId ? { cloudinaryPublicId } : {}),
      };
      await editPrayerRequest(token, groupId, editModalFor.id, payload);
      setPrayerRequests(
        groupId,
        open.map((r) =>
          r._id === editModalFor.id
            ? {
                ...r,
                content: payload.content,
                isAnonymous: payload.isAnonymous,
                deadline: payload.deadline ?? undefined,
                imageUrl: payload.imageUrl ?? undefined,
              }
            : r
        )
      );
      setEditModalFor(null);
    } catch {
      Alert.alert('Error', 'No se pudo editar la petición');
    } finally {
      setEditPosting(false);
      setUploadingImage(false);
    }
  }

  async function pickImage(onPicked: (asset: ImagePicker.ImagePickerAsset) => void) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para adjuntar fotos.');
      return;
    }
    // Hide the dark modal overlay so the native crop/edit controls are fully visible
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        onPicked(result.assets[0]);
      }
    } finally {
      setPickingImage(false);
    }
  }

  async function handlePost() {
    if (!newContent.trim()) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      let cloudinaryPublicId: string | undefined;
      if (newImage) {
        setUploadingImage(true);
        const ext = newImage.uri.split('.').pop() ?? 'jpg';
        const mimeType = newImage.mimeType ?? `image/${ext}`;
        const result = await uploadFile(token!, newImage.uri, mimeType, `prayer_${Date.now()}.${ext}`);
        imageUrl = result.url;
        cloudinaryPublicId = result.publicId;
        setUploadingImage(false);
      }

      const req = await createPrayerRequest(
        token!,
        groupId,
        newContent.trim(),
        isAnon,
        imageUrl,
        cloudinaryPublicId,
        newDeadline
      );
      setPrayerRequests(groupId, [req, ...open]);
      setShowAdd(false);
      setNewContent('');
      setNewDeadline(undefined);
      setNewImage(null);
      setIsAnon(false);
    } catch {
      Alert.alert('Error', 'No se pudo crear la petición');
    } finally {
      setPosting(false);
      setUploadingImage(false);
    }
  }

  function resetAddModal() {
    setShowAdd(false);
    setNewContent('');
    setNewDeadline(undefined);
    setNewImage(null);
    setIsAnon(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 14 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <FontAwesome5 name="praying-hands" size={15} color="#fff" />
          </View>
          <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 20 }}>Peticiones de oración</Text>
        </View>
      </View>

      <FlatList
        data={open}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingTop: 16 }}>
            <TouchableOpacity
              onPress={showAnswered ? () => setShowAnswered(false) : loadAnswered}
              style={{ marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgSecondary, borderRadius: 16 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
                {showAnswered ? 'Ocultar respondidas' : 'Ver peticiones respondidas'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {showAnswered ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {showAnswered && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>
                  ✅ Respondidas ({answeredRequests.length})
                </Text>
                {answeredRequests.length === 0 ? (
                  <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 12 }}>
                    No hay peticiones respondidas aún
                  </Text>
                ) : (
                  [...answeredRequests]
                    .sort((a, b) => new Date(b.answeredAt ?? b.createdAt).getTime() - new Date(a.answeredAt ?? a.createdAt).getTime())
                    .map((req) => (
                      <View key={req._id} style={{ backgroundColor: `${colors.bgSecondary}99`, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1, marginRight: 8 }}>{req.content}</Text>
                          {(req.isMyRequest || isAdmin) && (
                            <TouchableOpacity onPress={() => handleDeleteAnswered(req._id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="trash-outline" size={16} color={colors.danger} />
                            </TouchableOpacity>
                          )}
                        </View>
                        {req.imageUrl ? (
                          <Image source={{ uri: req.imageUrl }} style={{ width: '100%', height: 140, borderRadius: 10, marginVertical: 8 }} resizeMode="cover" />
                        ) : null}
                        {req.answeredNote ? (
                          <Text style={{ color: colors.accent, fontSize: 12, fontStyle: 'italic' }}>"{req.answeredNote}"</Text>
                        ) : null}
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                          ✅ Respondida el {req.answeredAt ? formatDate(req.answeredAt) : ''}
                        </Text>
                      </View>
                    ))
                )}
                <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
              </View>
            )}

            {open.length > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>
                🙏 Activas ({open.length})
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: colors.accent }}>
              <FontAwesome5 name="praying-hands" size={28} color="#fff" />
            </View>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              No hay peticiones activas. ¡Sé el primero en compartir una!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <RequestCard
            request={item}
            currentUserId={userId!}
            isAdmin={isAdmin}
            onTogglePray={handleTogglePray}
            onMarkAnswered={handleMarkAnswered}
            onDelete={handleDelete}
            onEdit={handleEditRequest}
            onViewPrayer={setSelectedPrayer}
            colors={colors}
          />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowAdd(true)}
        style={{ position: 'absolute', bottom: 32, right: 24, backgroundColor: colors.accent, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
      </TouchableOpacity>

      {/* ── Add Prayer Request Modal ── */}
      <Modal visible={showAdd} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={{ flex: 1, backgroundColor: pickingImage ? 'transparent' : 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            onPress={pickingImage ? undefined : resetAddModal}
          >
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Nueva petición de oración</Text>

                <TextInput
                  style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 16, minHeight: 100, textAlignVertical: 'top' }}
                  placeholder="Comparte tu petición... (máx. 500 caracteres)"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={newContent}
                  onChangeText={(t) => setNewContent(t.slice(0, 500))}
                  multiline
                  autoFocus
                />

                {/* Date field */}
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Fecha límite (opcional)</Text>
                <TouchableOpacity
                  onPress={() => setShowDeadlinePicker(true)}
                  style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: newDeadline ? 4 : 16 }}
                >
                  <Ionicons name="calendar-outline" size={16} color={newDeadline ? colors.accent : colors.inputPlaceholder} />
                  <Text style={{ color: newDeadline ? colors.inputText : colors.inputPlaceholder, fontSize: 14, flex: 1 }}>
                    {newDeadline
                      ? new Date(newDeadline).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Seleccionar fecha'}
                  </Text>
                  {newDeadline ? (
                    <Pressable onPress={(e) => { e.stopPropagation(); setNewDeadline(undefined); }}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </TouchableOpacity>
                {newDeadline ? <View style={{ marginBottom: 12 }} /> : null}

                {/* Image picker */}
                <TouchableOpacity
                  onPress={() => pickImage(setNewImage)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: newImage ? 10 : 16, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}
                >
                  <Ionicons name="image-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    {newImage ? 'Cambiar foto' : 'Adjuntar foto (opcional)'}
                  </Text>
                </TouchableOpacity>

                {newImage ? (
                  <View style={{ marginBottom: 16, position: 'relative' }}>
                    <Image source={{ uri: newImage.uri }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="cover" />
                    <TouchableOpacity
                      onPress={() => setNewImage(null)}
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 4 }}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Anonymous toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Publicar anónimamente</Text>
                  <Switch
                    value={isAnon}
                    onValueChange={setIsAnon}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor="#fff"
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePost}
                  disabled={!newContent.trim() || posting}
                  style={{ paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: !newContent.trim() ? colors.bgTertiary : colors.accent }}
                >
                  {posting ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      {uploadingImage ? <Text style={{ color: '#fff' }}>Subiendo imagen...</Text> : null}
                    </View>
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Publicar petición</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Pray message modal ── */}
      <Modal visible={!!prayModalFor} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setPrayModalFor(null)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                  <FontAwesome5 name="praying-hands" size={18} color="#fff" />
                </View>
                <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 18 }}>Estoy orando</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 12 }}>
                Añade un mensaje de aliento (opcional)
              </Text>
              <TextInput
                style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 20, minHeight: 80, textAlignVertical: 'top' }}
                placeholder="Ej. Te tengo en mis oraciones... (máx. 200 caracteres)"
                placeholderTextColor={colors.inputPlaceholder}
                value={prayMessage}
                onChangeText={(t) => setPrayMessage(t.slice(0, 200))}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => prayModalFor && submitPray(prayModalFor, undefined)}
                  disabled={prayPosting}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Sin mensaje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => prayModalFor && submitPray(prayModalFor, prayMessage.trim() || undefined)}
                  disabled={prayPosting}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: colors.accent }}
                >
                  {prayPosting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Orar 🙏</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── View prayer message modal ── */}
      <Modal visible={!!selectedPrayer} animationType="fade" transparent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }} onPress={() => setSelectedPrayer(null)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgSecondary, borderRadius: 24, padding: 24, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
                  {selectedPrayer?.userId?.name?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View>
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{selectedPrayer?.userId?.name ?? 'Miembro'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>está orando por ti</Text>
              </View>
            </View>
            {selectedPrayer?.message ? (
              <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontStyle: 'italic' }}>"{selectedPrayer.message}"</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontStyle: 'italic' }}>No dejó un mensaje.</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setSelectedPrayer(null)}
              style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit Prayer Request Modal ── */}
      <Modal visible={!!editModalFor} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={{ flex: 1, backgroundColor: pickingImage ? 'transparent' : 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            onPress={pickingImage ? undefined : resetEditModal}
          >
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>✏️ Editar petición</Text>

                <TextInput
                  style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 16, minHeight: 100, textAlignVertical: 'top' }}
                  placeholder="Edita tu petición... (máx. 500 caracteres)"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={editContent}
                  onChangeText={(t) => setEditContent(t.slice(0, 500))}
                  multiline
                  autoFocus
                />

                {/* Date field */}
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Fecha límite (opcional)</Text>
                <TouchableOpacity
                  onPress={() => setShowEditDeadlinePicker(true)}
                  style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
                >
                  <Ionicons name="calendar-outline" size={16} color={editDeadline ? colors.accent : colors.inputPlaceholder} />
                  <Text style={{ color: editDeadline ? colors.inputText : colors.inputPlaceholder, fontSize: 14, flex: 1 }}>
                    {editDeadline
                      ? new Date(editDeadline).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Seleccionar fecha'}
                  </Text>
                  {editDeadline ? (
                    <Pressable onPress={(e) => { e.stopPropagation(); setEditDeadline(undefined); }}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </TouchableOpacity>

                {/* Image picker */}
                <TouchableOpacity
                  onPress={() => pickImage(setEditImage)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: editImage || editImageUrl ? 10 : 16, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}
                >
                  <Ionicons name="image-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    {editImage || editImageUrl ? 'Cambiar foto' : 'Adjuntar foto (opcional)'}
                  </Text>
                </TouchableOpacity>

                {(editImage || editImageUrl) ? (
                  <View style={{ marginBottom: 16, position: 'relative' }}>
                    <Image source={{ uri: editImage ? editImage.uri : (editImageUrl as string) }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="cover" />
                    <TouchableOpacity
                      onPress={() => { setEditImage(null); setEditImageUrl(null); }}
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 4 }}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Anonymous toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Publicar anónimamente</Text>
                  <Switch
                    value={editIsAnon}
                    onValueChange={setEditIsAnon}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={resetEditModal}
                    disabled={editPosting}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmEdit}
                    disabled={!editContent.trim() || editPosting}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: !editContent.trim() ? colors.bgTertiary : colors.accent }}
                  >
                    {editPosting ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator color="#fff" size="small" />
                        {uploadingImage ? <Text style={{ color: '#fff' }}>Subiendo imagen...</Text> : null}
                      </View>
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Guardar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Mark Answered Modal ── */}
      <Modal visible={!!showAnswerModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setShowAnswerModal(null)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>✅ Marcar como respondida</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 16 }}>
                Opcionalmente, comparte cómo Dios respondió esta oración.
              </Text>
              <TextInput
                style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 20, minHeight: 80, textAlignVertical: 'top' }}
                placeholder="Escribe un testimonio (opcional)..."
                placeholderTextColor={colors.inputPlaceholder}
                value={answerNote}
                onChangeText={(t) => setAnswerNote(t.slice(0, 300))}
                multiline
              />
              <TouchableOpacity
                onPress={confirmMarkAnswered}
                style={{ backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal
        visible={showDeadlinePicker}
        title="Fecha límite de oración"
        value={newDeadline}
        onConfirm={(iso) => { setNewDeadline(iso); setShowDeadlinePicker(false); }}
        onClose={() => setShowDeadlinePicker(false)}
        colors={colors}
      />

      <DatePickerModal
        visible={showEditDeadlinePicker}
        title="Fecha límite de oración"
        value={editDeadline}
        onConfirm={(iso) => { setEditDeadline(iso); setShowEditDeadlinePicker(false); }}
        onClose={() => setShowEditDeadlinePicker(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
  StatusBar,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { ActivityIcon } from '../../src/components/ActivityIcon';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useActivitiesStore } from '../../src/store/useActivitiesStore';
import { useTheme } from '../../src/context/ThemeContext';
import {
  getGroupActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  cancelCommitment,
  getActivityCommitments,
  type GroupActivity,
  type ActivityType,
  type ActivityParticipant,
} from '../../src/services/activityService';
import { getGroupInfo } from '../../src/services/conversationService';
import { DatePickerModal } from '../../src/components/DatePickerModal';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const ACTIVITY_TYPES: { type: ActivityType; emoji: string; label: string }[] = [
  { type: 'ayuno',          emoji: '🤲', label: 'Ayuno' },
  { type: 'vigilia',        emoji: '🏆', label: 'Vigilia' },
  { type: 'cilicio',        emoji: '⛓️', label: 'Cilicio' },
  { type: 'escala_oracion', emoji: '🙏', label: 'Escala de Oración' },
  { type: 'bible_reading',  emoji: '📖', label: 'Lectura Bíblica' },
  { type: 'evangelism',     emoji: '🗣️', label: 'Evangelismo' },
];

function fmt(h: number | undefined, m: number | undefined): string {
  if (h == null || m == null) return '--:--';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function GroupActivitiesScreen() {
  const { colors, isDark } = useTheme();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuthStore();
  const userId = user?.id;
  const { activities, setActivities, myCommitments, setMyCommitments } = useActivitiesStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityType>('ayuno');
  const [activityName, setActivityName] = useState('');
  const [activityDesc, setActivityDesc] = useState('');
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [detailActivity, setDetailActivity] = useState<GroupActivity | null>(null);
  const [participants, setParticipants] = useState<ActivityParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const groupActivities = activities[groupId] ?? [];

  useFocusEffect(
    useCallback(() => {
      if (!token || !groupId) return;
      (async () => {
        try {
          const [acts, info] = await Promise.all([
            getGroupActivities(token, groupId),
            getGroupInfo(token, groupId),
          ]);
          setActivities(groupId, acts);
          setIsAdmin(info.isAdmin);
        } catch {
          Alert.alert('Error', 'No se pudieron cargar las actividades');
        } finally {
          setLoading(false);
        }
      })();
    }, [groupId, token])
  );

  async function openDetail(activity: GroupActivity) {
    setDetailActivity(activity);
    setLoadingParticipants(true);
    try {
      const data = await getActivityCommitments(token!, groupId, activity._id);
      setParticipants(data);
    } catch {
      setParticipants([]);
    } finally {
      setLoadingParticipants(false);
    }
  }

  function formatDateLabel(iso?: string): string {
    if (!iso) return 'Seleccionar';
    const d = new Date(iso);
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function handleCreate() {
    if (!token) return;
    if (startDate && endDate && endDate <= startDate) {
      Alert.alert('Fechas inválidas', 'La fecha de término debe ser posterior a la de inicio.');
      return;
    }
    setSaving(true);
    try {
      const act = await createActivity(token, groupId, {
        type: selectedType,
        name: activityName.trim() || undefined,
        description: activityDesc.trim() || undefined,
        startDate,
        endDate,
      });
      setActivities(groupId, [act, ...groupActivities]);
      setShowCreate(false);
      setActivityName('');
      setActivityDesc('');
      setStartDate(undefined);
      setEndDate(undefined);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo crear la actividad');
    } finally {
      setSaving(false);
    }
  }

  function handleLongPress(activity: GroupActivity) {
    if (!isAdmin) return;
    Alert.alert(activity.name, 'Opciones de administrador', [
      {
        text: activity.isActive ? 'Desactivar' : 'Activar',
        onPress: async () => {
          try {
            await updateActivity(token!, groupId, activity._id, { isActive: !activity.isActive });
            setActivities(groupId, groupActivities.map((a) =>
              a._id === activity._id ? { ...a, isActive: !a.isActive } : a
            ));
          } catch {
            Alert.alert('Error', 'No se pudo actualizar la actividad');
          }
        },
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          Alert.alert('¿Eliminar actividad?', 'Esta acción es permanente. Se eliminará la actividad y todos los compromisos que los miembros hicieron sobre ella. No se puede deshacer.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteActivity(token!, groupId, activity._id);
                  setActivities(groupId, groupActivities.filter((a) => a._id !== activity._id));
                } catch {
                  Alert.alert('Error', 'No se pudo eliminar');
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function handleCancelCommitment() {
    if (!detailActivity || !token) return;
    Alert.alert('¿Cancelar compromiso?', 'Dejarás de participar en esta actividad.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelCommitment(token, groupId, detailActivity._id);
            setActivities(groupId, groupActivities.map((a) =>
              a._id === detailActivity._id
                ? { ...a, myCommitment: null, committedCount: Math.max(0, (a.committedCount ?? 1) - 1) }
                : a
            ));
            setMyCommitments(myCommitments.filter((c) => {
              const actId = typeof c.activityId === 'string' ? c.activityId : (c.activityId as any)._id;
              return actId !== detailActivity._id;
            }));
            setDetailActivity(null);
            Alert.alert('Compromiso cancelado', 'Ya no participas en esta actividad.');
          } catch {
            Alert.alert('Error', 'No se pudo cancelar el compromiso');
          }
        },
      },
    ]);
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
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
          <Text style={{ color: colors.accent, fontSize: 15 }}>← Volver</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="flame" size={22} color={colors.accent} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 20, flex: 1 }}>Actividades del grupo</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => setShowCreate(true)}>
              <Text style={{ color: colors.accent, fontSize: 26 }}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={groupActivities}
        keyExtractor={(item) => item._id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 64 }}>
            <Ionicons name="flame-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              {isAdmin
                ? 'Aún no hay actividades. Toca + para crear una.'
                : 'El grupo aún no tiene actividades.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => openDetail(item)}
            onLongPress={() => handleLongPress(item)}
            style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, padding: 16, opacity: item.isActive ? 1 : 0.5 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIcon type={item.type} size={28} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>{item.name}</Text>
                {item.description ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>{item.description}</Text>
                ) : null}
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  {item.committedCount ?? 0} comprometido{(item.committedCount ?? 0) !== 1 ? 's' : ''}
                  {item.myCommitment ? ' · ✅ Participando' : ''}
                </Text>
                {(item.startDate || item.endDate) && (
                  <Text style={{ color: colors.accent, fontSize: 11, marginTop: 3 }}>
                    {item.startDate ? new Date(item.startDate).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}
                    {item.startDate && item.endDate ? ' → ' : ''}
                    {item.endDate ? new Date(item.endDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </Text>
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* ── Detail Modal ── */}
      <Modal
        visible={!!detailActivity}
        animationType="slide"
        onRequestClose={() => setDetailActivity(null)}
      >
        {detailActivity && (
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <TouchableOpacity onPress={() => setDetailActivity(null)} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 15 }}>← Volver</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIcon type={detailActivity.type} size={30} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 20 }}>{detailActivity.name}</Text>
                  {detailActivity.description ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>{detailActivity.description}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                <View style={{ flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 26 }}>
                    {detailActivity.committedCount ?? 0}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Comprometidos</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: detailActivity.myCommitment ? colors.onlineDot : colors.textMuted, fontWeight: '800', fontSize: 18, marginTop: 4 }}>
                    {detailActivity.myCommitment ? '✅ Sí' : 'No'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Participando</Text>
                </View>
              </View>

              {/* Participants section */}
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                Participantes
              </Text>

              {loadingParticipants ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
              ) : participants.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 10, textAlign: 'center' }}>
                    Nadie se ha comprometido aún.{'\n'}¡Sé el primero!
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {participants.map((p) => {
                    const isMe = p.userId._id === userId;
                    const days = Array.isArray(p.daysOfWeek) && p.daysOfWeek.length > 0
                      ? [...p.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_LABELS[d] ?? '?').join(', ')
                      : null;
                    return (
                      <View
                        key={p._id}
                        style={{
                          backgroundColor: isMe ? colors.bgTertiary : colors.bgSecondary,
                          borderRadius: 14,
                          padding: 14,
                          borderWidth: isMe ? 1 : 0,
                          borderColor: colors.accent,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          {p.userId.avatar ? (
                            <Image source={{ uri: p.userId.avatar }} style={{ width: 36, height: 36, borderRadius: 10, marginRight: 10 }} />
                          ) : (
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                              <Text style={{ color: colors.accent, fontWeight: 'bold', fontSize: 16 }}>
                                {p.userId.name?.[0]?.toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                              {p.userId.name}{isMe ? ' (Tú)' : ''}
                            </Text>
                            {p.proposito ? (
                              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 1 }} numberOfLines={2}>
                                "{p.proposito}"
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {days && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{days}</Text>
                          </View>
                        )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {fmt(p.startHour, p.startMinute)} – {fmt(p.endHour, p.endMinute)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 120 }} />
            </ScrollView>

            {/* Bottom CTA */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setDetailActivity(null);
                  router.push({
                    pathname: '/group-activities/commit/[activityId]' as any,
                    params: {
                      activityId: detailActivity._id,
                      groupId,
                      activityName: detailActivity.name,
                      activityEmoji: detailActivity.emoji,
                    },
                  });
                }}
                style={{
                  backgroundColor: colors.accent,
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Ionicons
                  name={detailActivity.myCommitment ? 'create-outline' : 'add-circle-outline'}
                  size={20}
                  color="#fff"
                />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  {detailActivity.myCommitment ? 'Editar mi compromiso' : 'Unirme a esta actividad'}
                </Text>
              </TouchableOpacity>
              {detailActivity.myCommitment && (
                <TouchableOpacity
                  onPress={handleCancelCommitment}
                  style={{ paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 15 }}>Cancelar compromiso</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        )}
      </Modal>

      {/* Create Activity Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setShowCreate(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
              <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
                <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Nueva actividad</Text>

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Tipo de actividad</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {ACTIVITY_TYPES.map((at) => (
                    <TouchableOpacity
                      key={at.type}
                      onPress={() => setSelectedType(at.type)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                        borderWidth: 1,
                        backgroundColor: selectedType === at.type ? colors.accent : colors.bgSecondary,
                        borderColor: selectedType === at.type ? colors.accentDark : colors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIcon type={at.type} size={15} color={colors.textPrimary} />
                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{at.label}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>Nombre (opcional)</Text>
                <TextInput
                  style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12 }}
                  placeholder="Ej. Oración de la mañana"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={activityName}
                  onChangeText={setActivityName}
                />

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>Descripción (opcional)</Text>
                <TextInput
                  style={{ backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 16, minHeight: 80, textAlignVertical: 'top' }}
                  placeholder="Descripción breve..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={activityDesc}
                  onChangeText={setActivityDesc}
                  multiline
                  numberOfLines={3}
                />

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Fechas (opcional)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>Inicio</Text>
                    <TouchableOpacity
                      onPress={() => setShowStartPicker(true)}
                      style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
                      <Ionicons name="calendar-outline" size={15} color={startDate ? colors.accent : colors.inputPlaceholder} />
                      <Text style={{ color: startDate ? colors.inputText : colors.inputPlaceholder, fontSize: 13, flex: 1 }}>
                        {formatDateLabel(startDate)}
                      </Text>
                    </TouchableOpacity>
                    {startDate ? (
                      <TouchableOpacity onPress={() => setStartDate(undefined)} style={{ marginTop: 4, alignSelf: 'flex-end' }}>
                        <Text style={{ color: colors.danger, fontSize: 11 }}>Quitar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={{ justifyContent: 'center', paddingTop: 16 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 16 }}>→</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>Término</Text>
                    <TouchableOpacity
                      onPress={() => setShowEndPicker(true)}
                      style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
                      <Ionicons name="calendar-outline" size={15} color={endDate ? colors.accent : colors.inputPlaceholder} />
                      <Text style={{ color: endDate ? colors.inputText : colors.inputPlaceholder, fontSize: 13, flex: 1 }}>
                        {formatDateLabel(endDate)}
                      </Text>
                    </TouchableOpacity>
                    {endDate ? (
                      <TouchableOpacity onPress={() => setEndDate(undefined)} style={{ marginTop: 4, alignSelf: 'flex-end' }}>
                        <Text style={{ color: colors.danger, fontSize: 11 }}>Quitar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={saving}
                  style={{ backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Crear actividad</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
      </Modal>

      <DatePickerModal
        visible={showStartPicker}
        title="Fecha de inicio"
        value={startDate}
        onConfirm={(iso) => { setStartDate(iso); setShowStartPicker(false); }}
        onClose={() => setShowStartPicker(false)}
        colors={colors}
      />
      <DatePickerModal
        visible={showEndPicker}
        title="Fecha de término"
        value={endDate}
        onConfirm={(iso) => { setEndDate(iso); setShowEndPicker(false); }}
        onClose={() => setShowEndPicker(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

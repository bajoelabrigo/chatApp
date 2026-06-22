import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';

const PERSONAL_SWIPE_WIDTH = 140;
const PERSONAL_CARD_WIDTH = Dimensions.get('window').width - 32;
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useActivitiesStore } from '../../src/store/useActivitiesStore';
import { useTheme } from '../../src/context/ThemeContext';
import { getMyCommitments, getMyPrayingRequests, togglePray, type ActivityCommitment, type ActivityType, type MyPrayingRequest } from '../../src/services/activityService';
import {
  getMyPersonalActivities,
  createPersonalActivity,
  updatePersonalActivity,
  deletePersonalActivity,
  type PersonalCommitment,
} from '../../src/services/personalActivityService';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const ACTIVITY_TYPES: { type: ActivityType; emoji: string; label: string }[] = [
  { type: 'ayuno',          emoji: '🤲', label: 'Ayuno' },
  { type: 'vigilia',        emoji: '🕯️', label: 'Vigilia' },
  { type: 'cilicio',        emoji: '⛓️', label: 'Cilicio' },
  { type: 'escala_oracion', emoji: '🙏', label: 'Escala de Oración' },
  { type: 'bible_reading',  emoji: '📖', label: 'Lectura Bíblica' },
  { type: 'evangelism',     emoji: '🗣️', label: 'Evangelismo' },
];

function fmt(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDays(days: number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
}

function getGroupId(c: ActivityCommitment): string {
  const g = c.groupId as any;
  return g?._id ?? (c.groupId as string);
}

function getGroupName(c: ActivityCommitment): string {
  const g = c.groupId as any;
  return g?.groupName ?? 'Grupo';
}

function getActivityName(c: ActivityCommitment): string {
  const a = c.activityId as any;
  return a?.name ?? 'Actividad';
}

function getActivityEmoji(c: ActivityCommitment): string {
  const a = c.activityId as any;
  return a?.emoji ?? '🙏';
}

// ── Inline time picker (chevrons) ──────────────────────────
function TimePicker({
  label, hour, minute, onChangeHour, onChangeMinute, colors,
}: {
  label: string;
  hour: number;
  minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
  colors: any;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {/* Hour */}
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity onPress={() => onChangeHour((hour + 1) % 24)} style={{ padding: 4 }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>▲</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', width: 40, textAlign: 'center' }}>
            {String(hour).padStart(2, '0')}
          </Text>
          <TouchableOpacity onPress={() => onChangeHour((hour - 1 + 24) % 24)} style={{ padding: 4 }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>▼</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 2 }}>:</Text>
        {/* Minute (0 or 30) */}
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity onPress={() => onChangeMinute(minute === 0 ? 30 : 0)} style={{ padding: 4 }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>▲</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', width: 40, textAlign: 'center' }}>
            {String(minute).padStart(2, '0')}
          </Text>
          <TouchableOpacity onPress={() => onChangeMinute(minute === 0 ? 30 : 0)} style={{ padding: 4 }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Commitment card ─────────────────────────────────────────
function CommitmentCard({
  emoji, name, tag, proposito, daysOfWeek, startHour, startMinute, endHour, endMinute,
  notificationsEnabled, colors, onPress, onOptions, style,
}: {
  emoji: string;
  name: string;
  tag: string;
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
  colors: any;
  onPress?: () => void;
  onOptions?: () => void;
  style?: object;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[{ backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }, style]}
    >
      {/* Row 1: emoji + name + notif */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>{name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tag}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Text style={{ fontSize: 16 }}>{notificationsEnabled ? '🔔' : '🔕'}</Text>
          {onOptions && (
            <TouchableOpacity
              onPress={onOptions}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 2 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 20, lineHeight: 22 }}>⋮</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Propósito */}
      {!!proposito && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 6 }} numberOfLines={2}>
          "{proposito}"
        </Text>
      )}

      {/* Days + time */}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {formatDays(daysOfWeek)} · {fmt(startHour, startMinute)} → {fmt(endHour, endMinute)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Swipeable wrapper for personal activities ────────────────
function SwipeablePersonalCard({
  p, colors, onEdit, onDelete, onOpen,
}: {
  p: PersonalCommitment;
  colors: any;
  onEdit: () => void;
  onDelete: () => void;
  onOpen?: (closeFn: () => void) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const [overlay, setOverlay] = useState(false);

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    isOpen.current = false;
    setOverlay(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10,
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -PERSONAL_SWIPE_WIDTH : 0;
        translateX.setValue(Math.min(0, Math.max(base + dx, -PERSONAL_SWIPE_WIDTH)));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -PERSONAL_SWIPE_WIDTH : 0;
        const finalDx = base + dx;
        if (finalDx < -40 || vx < -0.5) {
          Animated.spring(translateX, { toValue: -PERSONAL_SWIPE_WIDTH, useNativeDriver: true, bounciness: 0 }).start();
          isOpen.current = true;
          setOverlay(true);
          onOpen?.(close);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          isOpen.current = false;
          setOverlay(false);
        }
      },
    })
  ).current;

  return (
    <View style={{ marginBottom: 10, borderRadius: 14, overflow: 'hidden' }}>
      <Animated.View
        style={{ flexDirection: 'row', transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {/* Card — marginBottom: 0 porque el wrapper ya maneja el spacing */}
        <View style={{ width: PERSONAL_CARD_WIDTH }}>
          {/* Overlay transparente: captura toques sobre la card cuando está abierto */}
          {overlay && (
            <Pressable
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10 }}
              onPress={close}
            />
          )}
          <CommitmentCard
            emoji={p.emoji}
            name={p.name}
            tag="Personal"
            proposito={p.proposito}
            daysOfWeek={p.daysOfWeek}
            startHour={p.startHour}
            startMinute={p.startMinute}
            endHour={p.endHour}
            endMinute={p.endMinute}
            notificationsEnabled={p.notificationsEnabled}
            colors={colors}
            style={{ marginBottom: 0 }}
            onOptions={() => Alert.alert(p.name, '', [
              { text: 'Editar', onPress: () => onEdit() },
              { text: 'Eliminar', style: 'destructive', onPress: () => onDelete() },
              { text: 'Cancelar', style: 'cancel' },
            ])}
          />
        </View>
        {/* Botones revelados al deslizar */}
        <View style={{
          width: PERSONAL_SWIPE_WIDTH, flexDirection: 'row',
          gap: 6, paddingLeft: 6,
        }}>
          <TouchableOpacity
            onPress={() => { close(); onEdit(); }}
            style={{ flex: 1, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, marginTop: 3, fontWeight: '500' }}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { close(); onDelete(); }}
            style={{ flex: 1, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, marginTop: 3, fontWeight: '500' }}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────
export default function ActividadesScreen() {
  const { token } = useAuthStore();
  const { colors } = useTheme();
  const { myCommitments, setMyCommitments } = useActivitiesStore();
  const [personalActivities, setPersonalActivities] = useState<PersonalCommitment[]>([]);
  const [prayingRequests, setPrayingRequests] = useState<MyPrayingRequest[]>([]);
  const [leavingPrayerId, setLeavingPrayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => useActivitiesStore.getState().myCommitments.length === 0);
  const activeSwipeClose = useRef<(() => void) | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPersonalId, setEditingPersonalId] = useState<string | null>(null);

  // New personal activity form
  const [newType, setNewType] = useState<ActivityType>('ayuno');
  const [newProposito, setNewProposito] = useState('');
  const [newDays, setNewDays] = useState<Set<number>>(new Set());
  const [newStartHour, setNewStartHour] = useState(7);
  const [newStartMinute, setNewStartMinute] = useState(0);
  const [newEndHour, setNewEndHour] = useState(8);
  const [newEndMinute, setNewEndMinute] = useState(0);
  const [newNotif, setNewNotif] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      (async () => {
        try {
          const [commitments, personal, praying] = await Promise.all([
            getMyCommitments(token),
            getMyPersonalActivities(token),
            getMyPrayingRequests(token),
          ]);
          setMyCommitments(commitments);
          setPersonalActivities(personal);
          setPrayingRequests(praying);
        } catch {
          // silently ignore
        } finally {
          setLoading(false);
        }
      })();
    }, [token])
  );

  function resetForm() {
    setNewType('ayuno');
    setNewProposito('');
    setNewDays(new Set());
    setNewStartHour(7);
    setNewStartMinute(0);
    setNewEndHour(8);
    setNewEndMinute(0);
    setNewNotif(true);
    setEditingPersonalId(null);
  }

  function openEditPersonal(p: PersonalCommitment) {
    setEditingPersonalId(p._id);
    setNewType(p.type);
    setNewProposito(p.proposito ?? '');
    setNewDays(new Set(p.daysOfWeek));
    setNewStartHour(p.startHour);
    setNewStartMinute(p.startMinute);
    setNewEndHour(p.endHour);
    setNewEndMinute(p.endMinute);
    setNewNotif(p.notificationsEnabled);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (newDays.size === 0) {
      Alert.alert('Selecciona días', 'Debes elegir al menos un día.');
      return;
    }
    const startTotal = newStartHour * 60 + newStartMinute;
    const endTotal = newEndHour * 60 + newEndMinute;
    if (endTotal <= startTotal) {
      Alert.alert('Horario inválido', 'La hora de término debe ser posterior a la de inicio.');
      return;
    }

    const payload = {
      type: newType,
      proposito: newProposito.trim() || undefined,
      daysOfWeek: Array.from(newDays),
      startHour: newStartHour,
      startMinute: newStartMinute,
      endHour: newEndHour,
      endMinute: newEndMinute,
      notificationsEnabled: newNotif,
    };

    setSaving(true);
    try {
      if (editingPersonalId) {
        const updated = await updatePersonalActivity(token!, editingPersonalId, payload);
        setPersonalActivities((prev) => prev.map((x) => x._id === editingPersonalId ? updated : x));
      } else {
        const created = await createPersonalActivity(token!, payload);
        setPersonalActivities((prev) => [created, ...prev]);
      }
      setShowCreate(false);
      resetForm();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo guardar la actividad');
    } finally {
      setSaving(false);
    }
  }

  async function handleLeavePrayer(req: MyPrayingRequest) {
    if (!token) return;
    setLeavingPrayerId(req._id);
    try {
      await togglePray(token, req.groupId._id, req._id, undefined);
      setPrayingRequests((prev) => prev.filter((r) => r._id !== req._id));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la oración');
    } finally {
      setLeavingPrayerId(null);
    }
  }

  const uniqueGroupIds = [...new Set(myCommitments.map(getGroupId))];
  const hasAny = myCommitments.length > 0 || personalActivities.length > 0;

  const cardStyle = {
    marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' as const,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="flame" size={28} color={colors.accent} />
          <View>
            <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '800' }}>Actividades</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Tus compromisos espirituales</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} onScrollBeginDrag={() => { activeSwipeClose.current?.(); activeSwipeClose.current = null; }}>

        {/* ── Mis actividades ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, flex: 1 }}>Mis actividades</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{myCommitments.length + personalActivities.length} total</Text>
        </View>

        {!hasAny ? (
          <View style={{ marginHorizontal: 16, alignItems: 'center', paddingVertical: 32, backgroundColor: colors.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🌿</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 14 }}>
              Aún no tienes actividades.{'\n'}Únete a una desde tus grupos o crea una personal.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Group commitments */}
            {myCommitments.map((c) => (
              <CommitmentCard
                key={`group-${c._id}`}
                emoji={getActivityEmoji(c)}
                name={getActivityName(c)}
                tag={getGroupName(c)}
                proposito={c.proposito}
                daysOfWeek={c.daysOfWeek}
                startHour={c.startHour}
                startMinute={c.startMinute}
                endHour={c.endHour}
                endMinute={c.endMinute}
                notificationsEnabled={c.notificationsEnabled}
                colors={colors}
                onPress={() => {
                  const act = c.activityId as any;
                  const grp = c.groupId as any;
                  router.push({
                    pathname: '/group-activities/commit/[activityId]' as any,
                    params: {
                      activityId: act?._id ?? c.activityId,
                      groupId: grp?._id ?? c.groupId,
                      activityName: act?.name ?? 'Actividad',
                      activityEmoji: act?.emoji ?? '🙏',
                    },
                  });
                }}
              />
            ))}

            {/* Personal commitments */}
            {personalActivities.map((p) => (
              <SwipeablePersonalCard
                key={`personal-${p._id}`}
                p={p}
                colors={colors}
                onOpen={(closeFn) => {
                  if (activeSwipeClose.current && activeSwipeClose.current !== closeFn) {
                    activeSwipeClose.current();
                  }
                  activeSwipeClose.current = closeFn;
                }}
                onEdit={() => openEditPersonal(p)}
                onDelete={() => {
                  Alert.alert('¿Eliminar actividad?', `Se eliminará "${p.name}" de forma permanente. No se puede deshacer.`, [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Eliminar',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deletePersonalActivity(token!, p._id);
                          setPersonalActivities((prev) => prev.filter((x) => x._id !== p._id));
                        } catch {
                          Alert.alert('Error', 'No se pudo eliminar la actividad');
                        }
                      },
                    },
                  ]);
                }}
              />
            ))}
          </View>
        )}

        {/* ── Orando por ── */}
        {prayingRequests.length > 0 && (
          <>
            <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome5 name="praying-hands" size={16} color={colors.accent} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, flex: 1 }}>Orando por</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{prayingRequests.length} activa{prayingRequests.length !== 1 ? 's' : ''}</Text>
            </View>
            {prayingRequests.map((req) => {
              const authorName = req.isAnonymous ? 'Anónimo' : (req.authorId?.name ?? 'Miembro');
              const groupName = req.groupId?.groupName ?? 'Grupo';
              const startDate = new Date(req.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' });
              const deadlineDate = req.deadline
                ? new Date(req.deadline).toLocaleDateString('es', { day: 'numeric', month: 'short' })
                : null;
              return (
                <TouchableOpacity
                  key={req._id}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/group-prayer/[id]' as any, params: { id: req.groupId._id } })}
                  style={{
                    marginHorizontal: 16, marginBottom: 10,
                    backgroundColor: colors.bgSecondary,
                    borderRadius: 14, padding: 14,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  {/* Header: autor + grupo */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                          {authorName[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                          {authorName}
                        </Text>
                        <Text style={{ color: colors.accent, fontSize: 11 }} numberOfLines={1}>{groupName}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Contenido */}
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 8 }} numberOfLines={2}>
                    {req.content}
                  </Text>

                  {/* Fechas */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>Desde {startDate}</Text>
                    </View>
                    {deadlineDate && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="hourglass-outline" size={11} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Hasta {deadlineDate}</Text>
                      </View>
                    )}
                  </View>

                  {/* Botón Estoy orando */}
                  <TouchableOpacity
                    onPress={() => handleLeavePrayer(req)}
                    disabled={leavingPrayerId === req._id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 6, paddingVertical: 8, borderRadius: 10,
                      backgroundColor: 'rgba(34,197,94,0.15)',
                      borderWidth: 1, borderColor: '#16a34a',
                    }}
                  >
                    {leavingPrayerId === req._id ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <>
                        <FontAwesome5 name="praying-hands" size={12} color="#16a34a" />
                        <Text style={{ color: '#16a34a', fontWeight: '600', fontSize: 13 }}>Estoy orando</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Mis grupos ── */}
        {uniqueGroupIds.length > 0 && (
          <>
            <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 10 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>Mis grupos</Text>
            </View>
            <View style={cardStyle}>
              {uniqueGroupIds.map((gId, idx) => {
                const c = myCommitments.find((x) => getGroupId(x) === gId);
                const name = c ? getGroupName(c) : 'Grupo';
                return (
                  <View
                    key={gId}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                    }}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => router.push({ pathname: '/chat/[id]' as any, params: { id: gId, name, avatar: '', isGroup: '1' } })}
                      activeOpacity={0.6}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '600' }}>{name}</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/group-prayer/[id]' as any, params: { id: gId } })}
                        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}
                      >
                        <FontAwesome5 name="praying-hands" size={14} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/group-activities/[id]' as any, params: { id: gId } })}
                        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDark }}
                      >
                        <Ionicons name="flame" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowCreate(true)}
        style={{
          position: 'absolute', bottom: 28, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.accent,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>

      {/* ── Create / Edit personal activity modal ── */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            onPress={() => { setShowCreate(false); resetForm(); }}
          >
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 18, marginBottom: 18 }}>
                {editingPersonalId ? 'Editar actividad' : 'Nueva actividad personal'}
              </Text>

              {/* Type selector */}
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>Tipo</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {ACTIVITY_TYPES.map((at) => (
                  <TouchableOpacity
                    key={at.type}
                    onPress={() => setNewType(at.type)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                      backgroundColor: newType === at.type ? colors.accent : colors.bgSecondary,
                      borderColor: newType === at.type ? colors.accentDark : colors.border,
                    }}
                  >
                    <Text style={{ color: newType === at.type ? '#fff' : colors.textPrimary, fontSize: 13 }}>
                      {at.emoji} {at.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Propósito */}
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Propósito (opcional)</Text>
              <TextInput
                style={{
                  backgroundColor: colors.inputBg, color: colors.inputText,
                  borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginBottom: 4,
                }}
                placeholder="¿Cuál es tu intención?"
                placeholderTextColor={colors.inputPlaceholder}
                value={newProposito}
                onChangeText={(t) => setNewProposito(t.slice(0, 200))}
                multiline
                numberOfLines={3}
              />
              <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'right', marginBottom: 14 }}>
                {newProposito.length}/200
              </Text>

              {/* Days */}
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>Días</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {DAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setNewDays((prev) => {
                      const next = new Set(prev);
                      next.has(idx) ? next.delete(idx) : next.add(idx);
                      return next;
                    })}
                    style={{
                      flex: 1, aspectRatio: 1, borderRadius: 100,
                      alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                      backgroundColor: newDays.has(idx) ? colors.accent : colors.bgSecondary,
                      borderColor: newDays.has(idx) ? colors.accentDark : colors.border,
                    }}
                  >
                    <Text style={{ color: newDays.has(idx) ? '#fff' : colors.textPrimary, fontSize: 11, fontWeight: '600' }}>
                      {label[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Time */}
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>Horario</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16, backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 12 }}>
                <TimePicker
                  label="Inicio"
                  hour={newStartHour}
                  minute={newStartMinute}
                  onChangeHour={setNewStartHour}
                  onChangeMinute={setNewStartMinute}
                  colors={colors}
                />
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <TimePicker
                  label="Término"
                  hour={newEndHour}
                  minute={newEndMinute}
                  onChangeHour={setNewEndHour}
                  onChangeMinute={setNewEndMinute}
                  colors={colors}
                />
              </View>

              {/* Notifications */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Notificaciones</Text>
                <Switch
                  value={newNotif}
                  onValueChange={setNewNotif}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>

              {/* Confirm */}
              <TouchableOpacity
                onPress={handleCreate}
                disabled={saving || newDays.size === 0}
                style={{
                  paddingVertical: 14, borderRadius: 16, alignItems: 'center',
                  backgroundColor: newDays.size === 0 ? colors.bgSecondary : colors.accent,
                  opacity: newDays.size === 0 ? 0.6 : 1,
                  marginBottom: 8,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: newDays.size === 0 ? colors.textMuted : '#fff', fontWeight: '700', fontSize: 16 }}>
                    {editingPersonalId ? 'Guardar cambios' : 'Guardar actividad'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

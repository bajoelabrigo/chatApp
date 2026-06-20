import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
  Modal,
  Pressable,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../src/store/useAuthStore';
import { useTheme } from '../../../src/context/ThemeContext';
import { useActivitiesStore } from '../../../src/store/useActivitiesStore';
import {
  commitToActivity,
  cancelCommitment,
  getGroupActivities,
} from '../../../src/services/activityService';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmt(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function TimePickerModal({
  visible,
  title,
  hour,
  minute,
  onConfirm,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  hour: number;
  minute: number;
  onConfirm: (h: number, m: number) => void;
  onClose: () => void;
  colors: any;
}) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);

  const stepH = (dir: 1 | -1) => setH((v) => (v + dir + 24) % 24);
  const stepM = (dir: 1 | -1) => setM((v) => (v === 0 ? (dir === 1 ? 30 : 30) : dir === 1 ? 0 : 0));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderRadius: 20, padding: 28, width: 260 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>{title}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {/* Hour */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => stepH(1)} style={{ padding: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▲</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textPrimary, fontSize: 36, fontWeight: '700', width: 60, textAlign: 'center' }}>
                {String(h).padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={() => stepH(-1)} style={{ padding: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textPrimary, fontSize: 32, fontWeight: '700' }}>:</Text>

            {/* Minute */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => stepM(1)} style={{ padding: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▲</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textPrimary, fontSize: 36, fontWeight: '700', width: 60, textAlign: 'center' }}>
                {String(m).padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={() => stepM(-1)} style={{ padding: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.bgSecondary }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onConfirm(h, m); onClose(); }}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.accent }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CommitScreen() {
  const { colors, isDark } = useTheme();
  const { activityId, groupId, activityName, activityEmoji } = useLocalSearchParams<{
    activityId: string;
    groupId: string;
    activityName: string;
    activityEmoji: string;
  }>();
  const { token } = useAuthStore();
  const { myCommitments, setMyCommitments } = useActivitiesStore();

  const [proposito, setProposito] = useState('');
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [startHour, setStartHour] = useState(7);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(8);
  const [endMinute, setEndMinute] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token || !groupId) return;
      (async () => {
        try {
          const acts = await getGroupActivities(token, groupId);
          const myAct = acts.find((a) => a._id === activityId);
          if (myAct?.myCommitment) {
            const c = myAct.myCommitment;
            setHasExisting(true);
            setProposito(c.proposito ?? '');
            setSelectedDays(new Set(c.daysOfWeek));
            setStartHour(c.startHour);
            setStartMinute(c.startMinute);
            setEndHour(c.endHour);
            setEndMinute(c.endMinute);
            setNotificationsEnabled(c.notificationsEnabled);
          }
        } catch {
          // silently ignore
        } finally {
          setLoading(false);
        }
      })();
    }, [activityId, groupId, token])
  );

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  async function handleCommit() {
    if (selectedDays.size === 0) {
      Alert.alert('Selecciona días', 'Debes elegir al menos un día.');
      return;
    }
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) {
      Alert.alert('Horario inválido', 'La hora de término debe ser posterior a la de inicio.');
      return;
    }

    setSaving(true);
    try {
      let expoPushToken: string | undefined;
      try {
        const Device = require('expo-device');
        if (Device.isDevice) {
          const Notifications = require('expo-notifications');
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === 'granted') {
            const { data } = await Notifications.getExpoPushTokenAsync();
            expoPushToken = data;
          }
        }
      } catch {
        // expo-notifications not available
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await commitToActivity(token!, groupId, activityId, {
        proposito: proposito.trim() || undefined,
        daysOfWeek: Array.from(selectedDays),
        startHour,
        startMinute,
        endHour,
        endMinute,
        notificationsEnabled,
        timezone,
        expoPushToken,
      });

      Alert.alert(
        '✅ ¡Compromiso guardado!',
        `Te comprometiste con ${activityEmoji} ${activityName}.`,
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo guardar el compromiso');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    Alert.alert('¿Cancelar compromiso?', 'Dejarás de participar en esta actividad.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelCommitment(token!, groupId, activityId);
            setMyCommitments(myCommitments.filter((c) => {
              const actId = typeof c.activityId === 'string' ? c.activityId : (c.activityId as any)._id;
              return actId !== activityId;
            }));
            Alert.alert('Compromiso cancelado', 'Ya no participas en esta actividad.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } catch {
            Alert.alert('Error', 'No se pudo cancelar');
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
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 20 }}>
          {activityEmoji} {activityName}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
          {/* Propósito */}
          <View>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15, marginBottom: 8 }}>Propósito</Text>
            <TextInput
              style={{
                backgroundColor: colors.inputBg,
                color: colors.inputText,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 14,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
              placeholder="¿Cuál es tu intención con esta actividad? (opcional)"
              placeholderTextColor={colors.inputPlaceholder}
              value={proposito}
              onChangeText={(t) => setProposito(t.slice(0, 200))}
              multiline
              numberOfLines={3}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 4 }}>{proposito.length}/200</Text>
          </View>

          {/* Días */}
          <View>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15, marginBottom: 10 }}>Días</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {DAY_LABELS.map((label, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => toggleDay(idx)}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    backgroundColor: selectedDays.has(idx) ? colors.accent : colors.bgSecondary,
                    borderColor: selectedDays.has(idx) ? colors.accentDark : colors.border,
                  }}
                >
                  <Text style={{ color: selectedDays.has(idx) ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '500' }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Horario */}
          <View>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15, marginBottom: 10 }}>Horario</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setEditingTime('start')}
                style={{ flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Inicio</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>{fmt(startHour, startMinute)}</Text>
              </TouchableOpacity>
              <View style={{ justifyContent: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>→</Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingTime('end')}
                style={{ flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Término</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>{fmt(endHour, endMinute)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notificaciones */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 14 }}>
            <View>
              <Text style={{ color: colors.textPrimary, fontWeight: '500', fontSize: 15 }}>Notificaciones</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Recordatorio al inicio de la actividad</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Bottom actions */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12, gap: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TouchableOpacity
          onPress={handleCommit}
          disabled={saving || selectedDays.size === 0}
          style={{
            paddingVertical: 14, borderRadius: 16, alignItems: 'center',
            backgroundColor: selectedDays.size === 0 ? colors.bgSecondary : colors.accent,
            opacity: selectedDays.size === 0 ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: selectedDays.size === 0 ? colors.textMuted : '#fff', fontWeight: '600' }}>
              {hasExisting ? 'Actualizar compromiso' : 'Confirmar compromiso'}
            </Text>
          )}
        </TouchableOpacity>

        {hasExisting && (
          <TouchableOpacity onPress={handleCancel} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.danger }}>Cancelar compromiso</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Time pickers */}
      <TimePickerModal
        visible={editingTime === 'start'}
        title="Hora de inicio"
        hour={startHour}
        minute={startMinute}
        onConfirm={(h, m) => { setStartHour(h); setStartMinute(m); }}
        onClose={() => setEditingTime(null)}
        colors={colors}
      />
      <TimePickerModal
        visible={editingTime === 'end'}
        title="Hora de término"
        hour={endHour}
        minute={endMinute}
        onConfirm={(h, m) => { setEndHour(h); setEndMinute(m); }}
        onClose={() => setEditingTime(null)}
        colors={colors}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

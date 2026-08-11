import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { cld } from '../../src/lib/cldImage';
import { youtubeThumbnail } from '../../src/lib/youtube';
import {
  getSeminarDetail, joinSeminar, leaveSeminar, getMyProgress,
  type SeminarDetail, type SeminarProgress,
} from '../../src/services/seminarService';
import { ProgressBar } from '../../src/components/seminarios/ProgressBar';

export default function SeminarDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token } = useAuthStore();

  const [seminar, setSeminar] = useState<SeminarDetail | null>(null);
  const [progress, setProgress] = useState<SeminarProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await getSeminarDetail(token, id);
      setSeminar(data);
      if (data.isEnrolled) {
        const p = await getMyProgress(token, id);
        setProgress(p);
      } else {
        setProgress(null);
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar el seminario');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleJoin = async () => {
    if (!token || !id) return;
    setJoining(true);
    try {
      await joinSeminar(token, id);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'No se pudo inscribir');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Salir del seminario', 'Se borrará tu progreso, tus tareas y tu constancia. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          if (!token || !id) return;
          try {
            await leaveSeminar(token, id);
            await load();
          } catch {
            Alert.alert('Error', 'No se pudo salir del seminario');
          }
        },
      },
    ]);
  };

  if (loading || !seminar) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const classes = seminar.seminar.classes ?? [];
  const completedSet = new Set(progress?.completedClasses ?? []);
  const completedCount = classes.filter((c) => completedSet.has(c._id)).length;
  const allDone = classes.length > 0 && completedCount === classes.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }} numberOfLines={1}>{seminar.title}</Text>
        {seminar.isEnrolled && (
          <TouchableOpacity onPress={handleLeave} hitSlop={8}>
            <Ionicons name="exit-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {seminar.coverImage ? (
          <Image source={{ uri: cld(seminar.coverImage, 500) }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', height: 180, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school-outline" size={48} color={colors.textMuted} />
          </View>
        )}

        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>{seminar.title}</Text>
          {!!seminar.description && (
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, lineHeight: 20 }}>{seminar.description}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{classes.length} clases</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{seminar.participantsCount} inscritos</Text>
          </View>

          {!seminar.isEnrolled ? (
            <TouchableOpacity
              onPress={handleJoin}
              disabled={joining}
              style={{ marginTop: 16, backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: joining ? 0.7 : 1 }}
            >
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Inscribirme — es gratis</Text>}
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: 16 }}>
              <ProgressBar completed={completedCount} total={classes.length} colors={colors} height={10} />
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>{completedCount} de {classes.length} clases completadas</Text>
              {allDone && (
                <TouchableOpacity
                  onPress={() => router.push(`/seminarios/certificado/${id}` as any)}
                  style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingVertical: 12 }}
                >
                  <Ionicons name="ribbon-outline" size={18} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>Ver mi constancia</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Clases
          </Text>
          {classes.map((c, idx) => {
            const done = completedSet.has(c._id);
            const thumb = youtubeThumbnail(c.youtubeUrl) ?? c.image;
            return (
              <TouchableOpacity
                key={c._id}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/seminarios/clase/[classId]' as any, params: { classId: c._id, seminarId: id } })}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: colors.bgSecondary, borderRadius: 14,
                  borderWidth: 1, borderColor: colors.border,
                  padding: 10, marginBottom: 10,
                  opacity: c.locked ? 0.6 : 1,
                }}
              >
                <View style={{ width: 76, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.bgTertiary }}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{
                    position: 'absolute', top: 3, left: 3,
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: done ? colors.accent : 'rgba(0,0,0,0.55)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {c.locked ? (
                      <Ionicons name="lock-closed" size={10} color="#fff" />
                    ) : done ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 10 }}>{idx + 1}</Text>
                    )}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{c.title}</Text>
                  {!!c.duration && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{c.duration}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

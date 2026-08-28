import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, StyleSheet, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useAuthStore } from '../src/store/useAuthStore';
import { useReelsStore } from '../src/store/useReelsStore';
import { createReel, getYouTubeMeta, type ReelKind } from '../src/services/reelService';
import { uploadFile } from '../src/services/uploadService';
import { UploadBar } from '../src/components/UploadBar';

const MAX_SECONDS = 60;

type Source = 'camera' | 'gallery' | 'youtube';
type Tab = 'camera' | 'gallery' | 'youtube';

export default function ReelCreateScreen() {
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const upsertReel = useReelsStore((s) => s.upsertReel);

  // El tipo lo decide de dónde se venga: "Crear" en la fila de HISTORIAS crea
  // una historia. Estaba fijo en 'reel', así que todo lo publicado desde ahí
  // nacía como reel y el carrusel de historias se quedaba vacío pasara lo que
  // pasara (0 historias en la base a 2026-08-26, con reels publicados).
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const [tab, setTab] = useState<Tab>('camera');
  const [kind, setKind] = useState<ReelKind>(kindParam === 'story' ? 'story' : 'reel');
  const [caption, setCaption] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Cámara
  const camRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<any>(null);

  // Video elegido (grabado o de galería)
  const [picked, setPicked] = useState<{ uri: string; duration?: number } | null>(null);
  const previewPlayer = useVideoPlayer(picked?.uri ?? null, (p) => { p.loop = true; });

  // YouTube
  const [ytUrl, setYtUrl] = useState('');
  const [ytMeta, setYtMeta] = useState<{ videoId: string; title: string; thumbUrl: string } | null>(null);
  const [ytLoading, setYtLoading] = useState(false);

  useEffect(() => {
    // Nada de `pause()` en la limpieza: al salir de la pantalla expo-video ya
    // liberó el objeto nativo y llamar un método sobre él revienta el render.
    if (picked?.uri) { try { previewPlayer.play(); } catch { /* liberado */ } }
  }, [picked?.uri, previewPlayer]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Cámara ──────────────────────────────────────────────
  const startRecording = async () => {
    if (!camPermission?.granted) { requestCamPermission(); return; }
    try {
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      const video = await camRef.current?.recordAsync({ maxDuration: MAX_SECONDS });
      if (video?.uri) setPicked({ uri: video.uri, duration: elapsed });
    } catch { Alert.alert('Error', 'No se pudo grabar el video'); }
    finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    camRef.current?.stopRecording();
  };

  // ── Galería ─────────────────────────────────────────────
  const pickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: MAX_SECONDS,
      });
      const asset = res.assets?.[0];
      if (!asset) return;
      // `asset.duration` viene en MILISEGUNDOS. Comparado tal cual contra 60,
      // CUALQUIER video de la galería pasaba de 60 (un clip de 2 s son 2000) y
      // se rechazaba con «este dura 2000s»; y el que se colaba se guardaba con
      // una duración mil veces mayor.
      const seconds = asset.duration != null ? asset.duration / 1000 : undefined;
      if (seconds != null && seconds > MAX_SECONDS + 1) {
        Alert.alert('Video muy largo', `Máximo ${MAX_SECONDS} segundos (este dura ${Math.round(seconds)}s)`);
        return;
      }
      setPicked({ uri: asset.uri, duration: seconds != null ? Math.round(seconds) : undefined });
    } catch { /* cancelado */ }
  };

  // ── YouTube ─────────────────────────────────────────────
  const resolveYouTube = async () => {
    if (!token || !ytUrl.trim()) return;
    setYtLoading(true);
    try {
      const meta = await getYouTubeMeta(token, ytUrl.trim());
      setYtMeta(meta);
    } catch (e: any) {
      Alert.alert('Enlace inválido', e?.response?.data?.error ?? 'No se pudo leer el enlace de YouTube');
    } finally {
      setYtLoading(false);
    }
  };

  // ── Publicar ────────────────────────────────────────────
  const publish = async () => {
    if (!token) return;
    const ready =
      tab === 'youtube' ? !!ytMeta : !!picked?.uri;
    if (!ready) { Alert.alert('Falta el video', 'Graba, elige o pega un video antes de publicar'); return; }
    setPublishing(true);
    setProgress(0);
    try {
      let reel;
      if (tab === 'youtube' && ytMeta) {
        reel = await createReel(token, { kind, caption: caption.trim(), youtubeUrl: ytUrl.trim() });
      } else if (picked) {
        const up = await uploadFile(token, picked.uri, 'video/mp4', `reel-${Date.now()}.mp4`, setProgress);
        reel = await createReel(token, {
          kind,
          caption: caption.trim(),
          videoUrl: up.url,
          cloudinaryPublicId: up.publicId,
          durationSeconds: picked.duration != null ? Math.min(picked.duration, MAX_SECONDS) : undefined,
        });
      }
      if (reel) upsertReel(reel);
      router.back();
    } catch (e: any) {
      Alert.alert('No se pudo publicar', e?.response?.data?.error ?? 'Inténtalo de nuevo');
    } finally {
      setPublishing(false);
    }
  };

  const tabStyle = (t: string) => ({
    flex: 1, paddingVertical: 10, alignItems: 'center' as const, borderRadius: 12,
    backgroundColor: tab === t ? colors.accent : colors.bgTertiary,
  });
  const tabText = (t: string) => ({
    color: tab === t ? '#fff' : colors.textPrimary, fontWeight: '700' as const, fontSize: 13,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar style={colors.bgPrimary === '#0A0A0A' ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
            Crear reel / historia
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Tipo: Historia (24 h) o Reel (permanente) */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 8 }}>
          <TouchableOpacity style={tabStyle('reel') as any} onPress={() => setKind('reel')}>
            <Text style={tabText('reel')}>Reel (permanente)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={tabStyle('story') as any} onPress={() => setKind('story')}>
            <Text style={tabText('story')}>Historia (24 h)</Text>
          </TouchableOpacity>
        </View>

        {/* Origen */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 8 }}>
          {(['camera', 'gallery', 'youtube'] as Tab[]).map((t) => (
            <TouchableOpacity key={t} style={tabStyle(t) as any} onPress={() => setTab(t)}>
              <Text style={tabText(t)}>
                {t === 'camera' ? '🎥 Grabar' : t === 'gallery' ? '🖼️ Galería' : '▶️ YouTube'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} style={{ flex: 1 }}>
          {tab === 'camera' && (
            <View>
              <View style={{ aspectRatio: 9 / 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
                {!camPermission?.granted ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <Text style={{ color: '#fff' }}>Se necesita el permiso de cámara</Text>
                    <TouchableOpacity onPress={requestCamPermission} style={{ backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Permitir</Text>
                    </TouchableOpacity>
                  </View>
                ) : picked ? (
                  <VideoView player={previewPlayer} style={{ flex: 1 }} contentFit="cover" nativeControls surfaceType="textureView" />
                ) : (
                  <CameraView ref={camRef} style={{ flex: 1 }} mode="video" facing="back" />
                )}
              </View>
              {elapsed > 0 && recording && (
                <View style={{ position: 'absolute', top: 34, left: 0, right: 0, alignItems: 'center' }}>
                  <Text style={{ color: '#ff2d55', fontWeight: '800', fontSize: 22 }}>{Math.min(elapsed, MAX_SECONDS)}s</Text>
                </View>
              )}
              <View style={{ alignItems: 'center', marginTop: 14 }}>
                {picked ? (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => setPicked(null)} style={{ backgroundColor: colors.bgTertiary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Volver a grabar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={publish} disabled={publishing} style={{ backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 }}>
                      {publishing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Publicar</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={recording ? stopRecording : startRecording}
                    style={{
                      width: 76, height: 76, borderRadius: 38, borderWidth: 5,
                      borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: recording ? '#ff2d55' : colors.bgTertiary,
                    }}
                  >
                    <Ionicons name={recording ? 'stop' : 'videocam'} size={30} color={recording ? '#fff' : colors.accent} />
                  </TouchableOpacity>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                  {recording ? `Grabando… se corta a los ${MAX_SECONDS}s` : `Máximo ${MAX_SECONDS} segundos`}
                </Text>
              </View>
            </View>
          )}

          {tab === 'gallery' && (
            <View style={{ alignItems: 'center', paddingTop: 30, gap: 14 }}>
              <Ionicons name="images-outline" size={56} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
                Elige un video vertical de tu galería{'\n'}(máximo {MAX_SECONDS} segundos)
              </Text>
              {picked && (
                <View style={{ width: '70%', aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
                  <VideoView player={previewPlayer} style={{ flex: 1 }} contentFit="cover" nativeControls surfaceType="textureView" />
                </View>
              )}
              <TouchableOpacity
                onPress={picked ? publish : pickFromGallery}
                disabled={publishing}
                style={{ backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 }}
              >
                {publishing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{picked ? 'Publicar' : 'Elegir video'}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {tab === 'youtube' && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Pega el enlace de YouTube y se creará un reel con ese video:
              </Text>
              <TextInput
                value={ytUrl}
                onChangeText={(t) => { setYtUrl(t); setYtMeta(null); }}
                placeholder="https://youtube.com/watch?v=…"
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  color: colors.textPrimary, borderWidth: 1, borderColor: colors.border,
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {ytLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : !ytMeta ? (
                <TouchableOpacity onPress={resolveYouTube} style={{ backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Vista previa</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <Image source={{ uri: ytMeta.thumbUrl }} style={{ width: 80, height: 50, borderRadius: 8, backgroundColor: '#000' }} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }} numberOfLines={2}>{ytMeta.title}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>youtube.com/{ytMeta.videoId}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={publish} disabled={publishing} style={{ backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                    {publishing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Publicar reel</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {publishing && !!picked && (
            <View style={{ marginTop: 16, alignItems: 'center', backgroundColor: '#000', borderRadius: 12, padding: 14 }}>
              <UploadBar percent={progress} colors={colors} />
            </View>
          )}

          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Añade una descripción…"
            placeholderTextColor={colors.textMuted}
            maxLength={300}
            style={{
              backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
              color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginTop: 16, minHeight: 70,
              textAlignVertical: 'top',
            }}
            multiline
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { searchBackgroundPhotos, type BackgroundPhoto } from '../../services/bibleService';

// Compartir un versículo como imagen en la app nativa (#4 móvil). Renderiza un
// "póster" (LinearGradient o foto) y lo captura con react-native-view-shot para
// compartirlo con expo-sharing. En nativo no hay problema de CORS al capturar
// fotos remotas.

interface ThemeDef {
  id: string;
  colors: [string, string, ...string[]];
  text: string;
  accent: string;
  sub: string;
}

const THEMES: ThemeDef[] = [
  { id: 'noche', colors: ['#0f2027', '#203a43', '#2c5364'], text: '#ffffff', accent: '#f5c66b', sub: 'rgba(255,255,255,0.7)' },
  { id: 'oceano', colors: ['#1e3c72', '#2a5298'], text: '#ffffff', accent: '#8ec5ff', sub: 'rgba(255,255,255,0.72)' },
  { id: 'bosque', colors: ['#0f5132', '#3a8f5f'], text: '#ffffff', accent: '#bff0cf', sub: 'rgba(255,255,255,0.72)' },
  { id: 'purpura', colors: ['#5b247a', '#a044ff'], text: '#ffffff', accent: '#f0d0ff', sub: 'rgba(255,255,255,0.74)' },
  { id: 'amanecer', colors: ['#FF9A5A', '#FF5F8D'], text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.78)' },
  { id: 'vino', colors: ['#870000', '#3a0000'], text: '#ffffff', accent: '#f5c66b', sub: 'rgba(255,255,255,0.72)' },
  { id: 'grafito', colors: ['#232526', '#414345'], text: '#ffffff', accent: '#f5c66b', sub: 'rgba(255,255,255,0.7)' },
  { id: 'lavanda', colors: ['#834d9b', '#d04ed6'], text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.78)' },
  { id: 'coral', colors: ['#ff5858', '#f09819'], text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.82)' },
  { id: 'menta', colors: ['#134e5e', '#71b280'], text: '#ffffff', accent: '#eafff1', sub: 'rgba(255,255,255,0.75)' },
  { id: 'cielo', colors: ['#2c3e50', '#4ca1af'], text: '#ffffff', accent: '#d7f4ff', sub: 'rgba(255,255,255,0.75)' },
  { id: 'crema', colors: ['#f7f1e3', '#f7f1e3'], text: '#2d2a26', accent: '#b3701f', sub: '#8a8172' },
];

const PHOTO_THEME = { text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.85)' };

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

// Tamaño del versículo (referido al diseño de 1080; se escala después).
function verseBaseSize(len: number, tall: boolean) {
  let s;
  if (len <= 60) s = 70;
  else if (len <= 110) s = 60;
  else if (len <= 180) s = 51;
  else if (len <= 260) s = 44;
  else if (len <= 360) s = 38;
  else if (len <= 480) s = 33;
  else s = 28;
  return tall ? s + 6 : s;
}

interface Props {
  verse: { book: string; chapter: string; verse: string; text: string };
  versionLabel: string;
  onClose: () => void;
}

export default function VerseImageSheet({ verse, versionLabel, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const posterRef = useRef<View>(null);

  const [themeId, setThemeId] = useState('noche');
  const [isStory, setIsStory] = useState(false);
  const [bgMode, setBgMode] = useState<'color' | 'photo'>('color');
  const [busy, setBusy] = useState(false);

  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState<BackgroundPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const usingPhoto = bgMode === 'photo' && !!photoUrl;
  const t = usingPhoto ? PHOTO_THEME : theme;

  // Dimensiones del póster (diseño 1080 escalado a la pantalla).
  const screenW = Dimensions.get('window').width;
  const POSTER_W = Math.min(screenW - 48, 340);
  const POSTER_H = isStory ? POSTER_W * (16 / 9) : POSTER_W;
  const scale = POSTER_W / 1080;
  const s = (n: number) => n * scale;

  const reference = `${verse.book} ${verse.chapter}:${verse.verse}`;
  const verseSize = s(verseBaseSize(verse.text.length, isStory));

  const loadPhotos = async (q: string) => {
    setPhotosLoading(true);
    try {
      setPhotos(await searchBackgroundPhotos(q, 1));
    } catch {
      setPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  };

  const openPhotoTab = () => {
    setBgMode('photo');
    if (!loadedOnce) {
      setLoadedOnce(true);
      loadPhotos('');
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(posterRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${reference} — HolyHolyHoly`,
        });
      }
    } catch {
      // el usuario canceló o falló la captura — sin ruido
    } finally {
      setBusy(false);
    }
  };

  const shareDisabled = busy || (usingPhoto && !photoReady);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Compartir como imagen</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
          {/* ── PÓSTER (capturable) ── */}
          <View
            ref={posterRef}
            collapsable={false}
            style={{
              width: POSTER_W, height: POSTER_H, borderRadius: 16, overflow: 'hidden',
              backgroundColor: '#111',
            }}
          >
            {usingPhoto ? (
              <>
                <Image
                  source={{ uri: photoUrl! }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  onLoad={() => setPhotoReady(true)}
                  onError={() => setPhotoReady(false)}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
              </>
            ) : (
              <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}

            {/* Contenido */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(120), paddingVertical: s(100) }}>
              <Text style={{
                position: 'absolute', top: s(isStory ? 180 : 40), left: s(80),
                fontSize: s(300), lineHeight: s(300), color: t.accent, opacity: usingPhoto ? 0.3 : 0.18,
                fontFamily: SERIF,
              }}>“</Text>

              <Text style={{
                color: t.text, fontSize: verseSize, lineHeight: verseSize * 1.42, textAlign: 'center',
                fontWeight: '500', fontFamily: SERIF,
                textShadowColor: usingPhoto ? 'rgba(0,0,0,0.5)' : 'transparent',
                textShadowRadius: usingPhoto ? 6 : 0, textShadowOffset: { width: 0, height: 1 },
              }}>
                {verse.text}
              </Text>

              <View style={{ width: s(96), height: s(4), backgroundColor: t.accent, borderRadius: 2, marginVertical: s(38) }} />

              <Text style={{
                color: t.accent, fontSize: s(42), fontWeight: '800', letterSpacing: s(3),
                textAlign: 'center', textTransform: 'uppercase',
                textShadowColor: usingPhoto ? 'rgba(0,0,0,0.5)' : 'transparent',
                textShadowRadius: usingPhoto ? 6 : 0, textShadowOffset: { width: 0, height: 1 },
              }}>
                {reference}
              </Text>
              <Text style={{ color: t.sub, fontSize: s(27), marginTop: s(12), letterSpacing: s(1) }}>{versionLabel}</Text>

              <Text style={{
                position: 'absolute', bottom: s(56), color: t.sub, fontSize: s(26), letterSpacing: s(1),
              }}>holyholyholy.es</Text>
            </View>
          </View>

          {/* ── Controles ── */}
          <View style={{ width: POSTER_W, marginTop: 20, gap: 14 }}>
            {/* Formato */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[{ k: false, label: 'Cuadrado' }, { k: true, label: 'Historia' }].map((f) => (
                <TouchableOpacity
                  key={f.label}
                  onPress={() => setIsStory(f.k)}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center',
                    backgroundColor: isStory === f.k ? colors.accent : colors.bgTertiary,
                    borderWidth: 1, borderColor: isStory === f.k ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{ color: isStory === f.k ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Color / Foto */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[{ k: 'color' as const, label: 'Color' }, { k: 'photo' as const, label: 'Foto' }].map((m) => (
                <TouchableOpacity
                  key={m.k}
                  onPress={() => (m.k === 'photo' ? openPhotoTab() : setBgMode('color'))}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center',
                    backgroundColor: bgMode === m.k ? colors.accent : colors.bgTertiary,
                    borderWidth: 1, borderColor: bgMode === m.k ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{ color: bgMode === m.k ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {bgMode === 'color' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                {THEMES.map((th) => (
                  <TouchableOpacity
                    key={th.id}
                    onPress={() => setThemeId(th.id)}
                    style={{
                      width: 38, height: 38, borderRadius: 19, overflow: 'hidden',
                      borderWidth: themeId === th.id ? 3 : 1,
                      borderColor: themeId === th.id ? colors.accent : colors.border,
                    }}
                  >
                    <LinearGradient colors={th.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={photoQuery}
                    onChangeText={setPhotoQuery}
                    onSubmitEditing={() => loadPhotos(photoQuery.trim())}
                    placeholder="Buscar fotos (cielo, mar...)"
                    placeholderTextColor={colors.inputPlaceholder}
                    returnKeyType="search"
                    style={{
                      flex: 1, backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
                      borderColor: colors.border, color: colors.inputText, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => loadPhotos(photoQuery.trim())}
                    style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent }}
                  >
                    <Ionicons name="search" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                {photosLoading ? (
                  <ActivityIndicator color={colors.accent} style={{ paddingVertical: 20 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {photos.map((p) => {
                      const selected = photoUrl === p.full;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => { setPhotoUrl(p.full); setPhotoReady(false); }}
                          style={{
                            width: (POSTER_W - 16) / 3, height: (POSTER_W - 16) / 3, borderRadius: 8, overflow: 'hidden',
                            borderWidth: selected ? 2 : 0, borderColor: colors.accent,
                          }}
                        >
                          <Image source={{ uri: p.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>Fotos de Pexels</Text>
              </View>
            )}

            {/* Compartir */}
            <TouchableOpacity
              onPress={handleShare}
              disabled={shareDisabled}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent, opacity: shareDisabled ? 0.6 : 1,
                marginTop: 4,
              }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="share-social" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {usingPhoto && !photoReady ? 'Cargando foto...' : 'Compartir'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

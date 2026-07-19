import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { searchBackgroundPhotos, type BackgroundPhoto } from '../../services/bibleService';
import {
  FORMATS,
  FONTS,
  TEMPLATES,
  fontById,
  verseBaseSize,
  normalizeWord,
  loadPosterFonts,
  type AlignId,
  highlightColor,
  type FormatDef,
} from '../../lib/versePosterLayout';

// Compartir un versículo como imagen en la app nativa (#4 móvil). Renderiza un
// "póster" (LinearGradient o foto) y lo captura con react-native-view-shot para
// compartirlo con expo-sharing. En nativo no hay problema de CORS al capturar
// fotos remotas.
//
// Es el ESPEJO del modal de la web (`VerseImageModal.jsx`), pero con otro motor:
// allí se dibuja en un canvas, aquí se captura una vista. Ver
// `src/lib/versePosterLayout.ts` para lo que comparten.

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

const PHOTO_THEME = { text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.92)' };

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const SANS = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });

interface Props {
  verse: { book: string; chapter: string; verse: string; text: string };
  versionLabel: string;
  onClose: () => void;
}

export default function VerseImageSheet({ verse, versionLabel, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const posterRef = useRef<View>(null); // póster a tamaño completo (fuera de pantalla)
  const previewRef = useRef<View>(null); // el visible, solo como respaldo de captura

  const [themeId, setThemeId] = useState('noche');
  const [formatId, setFormatId] = useState('square');
  const [fontId, setFontId] = useState('clasica');
  const [align, setAlign] = useState<AlignId>('center');
  const [highlight, setHighlight] = useState('');
  const [customText, setCustomText] = useState<string | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [bgMode, setBgMode] = useState<'color' | 'photo'>('color');
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState<BackgroundPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [ownPhoto, setOwnPhoto] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Las fuentes se cargan al abrir la hoja, no al arrancar la app. Hasta que
  // estén, el póster usa la del sistema; por eso `fontsReady` entra en el
  // fontFamily y no solo en un spinner.
  useEffect(() => {
    let vivo = true;
    loadPosterFonts().then(() => vivo && setFontsReady(true));
    return () => {
      vivo = false;
    };
  }, []);

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const format = FORMATS.find((f) => f.id === formatId) || FORMATS[0];
  const font = fontById(fontId);
  const usingPhoto = bgMode === 'photo' && !!photoUrl;
  const t = usingPhoto ? PHOTO_THEME : theme;
  // El resaltado no usa el acento sin más: hay temas cuyo acento es blanco o
  // casi y dentro del texto no se distinguiría (ver highlightColor).
  const hiColor = highlightColor(t, usingPhoto);

  const originalText = verse.text || '';
  const text = customText?.trim() ? customText : originalText;
  const edited = !!customText?.trim() && customText.trim() !== originalText.trim();

  // Dimensiones del póster (diseño de 1080 escalado a la pantalla).
  const screenW = Dimensions.get('window').width;
  const POSTER_W = Math.min(screenW - 48, 340);
  const POSTER_H = POSTER_W * (format.h / format.w);
  // La previa va fija arriba, así que se le pone techo de alto: "Historia" y
  // "Fondo" son tan verticales que a tamaño natural no dejarían ver los
  // controles. Solo afecta a lo que se VE; la captura va a tamaño completo.
  const previewScale = Math.min(1, 250 / POSTER_H);
  const scale = POSTER_W / format.w;
  const s = (n: number) => n * scale;

  const reference = `${verse.book} ${verse.chapter}:${verse.verse}`;
  const verseSize = s(verseBaseSize(text.length, format, font));
  const lineHeight = verseSize * 1.55 * (font.lineScale ?? 1);

  // La familia solo se aplica cuando las fuentes ya están: si no, Android
  // pinta con una familia inexistente y sale la de defecto sin avisar.
  const verseFamily = font.family
    ? fontsReady
      ? font.family
      : SERIF
    : font.id === 'moderna'
      ? SANS
      : SERIF;

  const izq = align === 'left';
  const der = align === 'right';
  const textAlign: 'left' | 'center' | 'right' = align;
  const alignItems = izq ? 'flex-start' : der ? 'flex-end' : 'center';

  // Palabras del texto, sin repetir y sin las cortas (artículos y
  // preposiciones: resaltarlas no aporta y llenan la lista).
  const palabras = useMemo(() => {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const bruta of String(text).split(/\s+/)) {
      const limpia = bruta.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      const clave = normalizeWord(limpia);
      if (clave.length < 4 || vistas.has(clave)) continue;
      vistas.add(clave);
      out.push(limpia);
    }
    return out;
  }, [text]);

  // Si al editar el texto desaparece la palabra resaltada, se limpia: si no,
  // quedaría un resaltado activo que no pinta nada y no se puede quitar.
  useEffect(() => {
    if (highlight && !palabras.some((p) => normalizeWord(p) === normalizeWord(highlight))) {
      setHighlight('');
    }
  }, [palabras, highlight]);

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

  // Foto propia del carrete. En nativo el URI es un archivo local, así que no
  // hay que materializar nada (a diferencia de la web en Android).
  const pickOwnPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso denegado', 'Activa el acceso a la galería en Ajustes.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setPhotoUrl(res.assets[0].uri);
    setOwnPhoto(true);
    setPhotoReady(false);
    setBgMode('photo');
  };

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setThemeId(tpl.themeId);
    setFontId(tpl.fontId);
    setAlign(tpl.align);
    // Una plantilla define el fondo: con una foto encima no se vería.
    setBgMode('color');
  };

  const capturePreviewRef = () => captureRef(previewRef, { format: 'png', quality: 1 });

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Se captura el póster a tamaño completo (fuera de pantalla). Si eso
      // fallara —capturar una vista no visible depende del dispositivo— se cae
      // a la previa, que sí está en pantalla: la imagen sale más pequeña, pero
      // compartir NUNCA se queda sin funcionar, que es lo que importa.
      let uri: string;
      try {
        uri = await captureRef(posterRef, { format: 'png', quality: 1 });
      } catch {
        uri = await capturePreviewRef();
      }
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

  // Sombra/contorno del texto sobre foto (el contorno real no existe en RN;
  // la sombra es lo que hay).
  const sombra = usingPhoto
    ? {
        textShadowColor: 'rgba(0,0,0,0.85)' as const,
        textShadowRadius: 12,
        textShadowOffset: { width: 0, height: 2 },
      }
    : {};

  const chip = (activo: boolean) => ({
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: activo ? colors.accent : colors.bgTertiary,
    borderWidth: 1,
    borderColor: activo ? colors.accent : colors.border,
  });
  const chipText = (activo: boolean) => ({
    color: activo ? '#fff' : colors.textSecondary,
    fontWeight: '600' as const,
    fontSize: 13,
  });

  // El contenido del póster se declara UNA vez y se pinta DOS: la vista
  // previa (encogida) y el póster a tamaño real que se captura fuera de
  // pantalla. Si el transform de la previa estuviera en la vista capturada,
  // la imagen compartida saldría encogida.
  const posterInner = (
    <>
                {usingPhoto ? (
    <>
      <Image
        source={{ uri: photoUrl! }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => setPhotoReady(true)}
        onError={() => setPhotoReady(false)}
      />
      {/* Velo: más cargado en el centro (donde cae el versículo) y abajo.
          Con un velo plano el texto se perdía en las fotos claras. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.72)']}
        style={StyleSheet.absoluteFill}
      />
    </>
                ) : (
    <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}

                {/* Contenido */}
                <View style={{
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: s(120), paddingVertical: s(100),
                }}>
    <Text style={{
      position: 'absolute', top: s(format.h > format.w ? 180 : 40), left: s(80),
      fontSize: s(300), lineHeight: s(300), color: t.accent, opacity: usingPhoto ? 0.3 : 0.18,
      fontFamily: verseFamily,
    }}>“</Text>

    {/* El bloque (versículo + línea + referencia) se desplaza en el
        formato de fondo de pantalla, para no quedar bajo los iconos. */}
    <View style={{
      alignItems,
      width: format.textWidth ? s(format.w * format.textWidth) : undefined,
      alignSelf: 'stretch',
      transform: format.shiftY ? [{ translateY: format.shiftY * POSTER_H }] : undefined,
    }}>
      <Text style={{
        color: t.text, fontSize: verseSize, lineHeight, textAlign,
        fontWeight: font.weight ?? '400', fontFamily: verseFamily,
        ...sombra,
      }}>
        {highlight
          ? String(text).split(/(\s+)/).map((trozo, i) =>
              normalizeWord(trozo) === normalizeWord(highlight) && !/^\s+$/.test(trozo) ? (
                <Text key={i} style={{ color: hiColor }}>{trozo}</Text>
              ) : (
                trozo
              )
            )
          : text}
      </Text>

      <View style={{ width: s(96), height: s(4), backgroundColor: t.accent, borderRadius: 2, marginVertical: s(38) }} />

      <Text style={{
        color: t.accent, fontSize: s(42), fontWeight: '800', letterSpacing: s(3),
        textAlign, textTransform: 'uppercase', ...sombra,
      }}>
        {reference}
      </Text>
      <Text style={{
        color: t.sub, fontSize: s(27), fontWeight: '600', marginTop: s(12), letterSpacing: s(1),
        textAlign, ...sombra,
      }}>{versionLabel}</Text>
    </View>

    {/* El pie va SIEMPRE centrado, aunque el versículo no lo esté:
        es el cierre de la imagen, no parte del bloque de texto. */}
    <Text style={{
      position: 'absolute', bottom: s(56), color: t.sub, fontSize: s(26),
      fontWeight: '600', letterSpacing: s(1), ...sombra,
    }}>holyholyholy.es</Text>
      </View>
    </>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        {/* Cabecera + vista previa, fijas: al bajar a los controles se perdía
            de vista justo lo que se está ajustando. */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12,
          }}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Compartir como imagen</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Vista previa: el póster encogido para que quepa junto a los
              controles. NO es el que se captura — ver el de abajo del todo. */}
          <View style={{ alignItems: 'center', paddingBottom: 14 }}>
            <View style={{ width: POSTER_W * previewScale, height: POSTER_H * previewScale }}>
              <View
                ref={previewRef}
                collapsable={false}
                style={{
                  width: POSTER_W,
                  height: POSTER_H,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#111',
                  transform: [{ scale: previewScale }],
                  transformOrigin: 'top left',
                }}
              >
                {posterInner}
              </View>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ gap: 14 }}>
            {/* Plantillas */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {TEMPLATES.map((tpl) => {
                const th = THEMES.find((x) => x.id === tpl.themeId) || THEMES[0];
                const activa = themeId === tpl.themeId && fontId === tpl.fontId && align === tpl.align;
                return (
                  <TouchableOpacity key={tpl.id} onPress={() => applyTemplate(tpl)} style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 54, height: 40, borderRadius: 8, overflow: 'hidden',
                      borderWidth: activa ? 3 : 1, borderColor: activa ? colors.accent : colors.border,
                    }}>
                      <LinearGradient colors={th.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 3 }}>{tpl.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Formato */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FORMATS.map((f: FormatDef) => {
                const activo = formatId === f.id;
                return (
                  <TouchableOpacity key={f.id} onPress={() => setFormatId(f.id)} style={chip(activo)}>
                    <Text style={chipText(activo)}>{f.name}</Text>
                    <Text style={{ color: activo ? 'rgba(255,255,255,0.8)' : colors.textMuted, fontSize: 10 }}>{f.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Tipografía */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FONTS.map((f) => {
                const activo = fontId === f.id;
                return (
                  <TouchableOpacity key={f.id} onPress={() => setFontId(f.id)} style={chip(activo)}>
                    <Text style={[chipText(activo), { fontFamily: f.family && fontsReady ? f.family : undefined }]}>
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Alineación + palabra resaltada */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {([
                { id: 'left' as const, icon: 'text-outline' as const },
                { id: 'center' as const, icon: 'text' as const },
                { id: 'right' as const, icon: 'text-outline' as const },
              ]).map((a, i) => {
                const activo = align === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setAlign(a.id)}
                    accessibilityLabel={['Izquierda', 'Centrado', 'Derecha'][i]}
                    style={[chip(activo), { paddingHorizontal: 14 }]}
                  >
                    <Ionicons
                      name={a.id === 'center' ? 'reorder-three' : 'reorder-four'}
                      size={16}
                      color={activo ? '#fff' : colors.textSecondary}
                      style={{ transform: a.id === 'right' ? [{ scaleX: -1 }] : undefined }}
                    />
                  </TouchableOpacity>
                );
              })}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity onPress={() => setHighlight('')} style={chip(!highlight)}>
                  <Text style={chipText(!highlight)}>Sin resaltar</Text>
                </TouchableOpacity>
                {palabras.map((p) => {
                  const activo = normalizeWord(p) === normalizeWord(highlight);
                  return (
                    <TouchableOpacity key={p} onPress={() => setHighlight(p)} style={chip(activo)}>
                      <Text style={chipText(activo)}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Texto editable: lo que se comparte suele ser un trozo, no el
                versículo entero. La referencia no se toca nunca. */}
            {editingText ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  autoFocus
                  multiline
                  value={customText ?? originalText}
                  onChangeText={setCustomText}
                  maxLength={600}
                  style={{
                    backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
                    borderColor: colors.border, color: colors.inputText,
                    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 90,
                    textAlignVertical: 'top',
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    onPress={() => { setCustomText(null); setEditingText(false); }}
                    disabled={!edited}
                  >
                    <Text style={{ color: edited ? colors.accent : colors.textMuted, fontSize: 13 }}>Restaurar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingText(false)}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Listo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setEditingText(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {edited ? 'Texto editado — tocar para cambiar' : 'Editar o acortar el texto'}
                </Text>
              </TouchableOpacity>
            )}

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

                {/* Foto propia. El texto cambia al elegirla: si no, no hay forma
                    de saber si la subida funcionó. */}
                <TouchableOpacity
                  onPress={pickOwnPhoto}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                    borderColor: ownPhoto ? '#22C55E' : colors.border,
                  }}
                >
                  <Ionicons
                    name={ownPhoto ? 'checkmark' : 'image-outline'}
                    size={16}
                    color={ownPhoto ? '#22C55E' : colors.textSecondary}
                  />
                  <Text style={{ color: ownPhoto ? '#22C55E' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                    {ownPhoto ? 'Imagen elegida — cambiar' : 'Usar una foto mía'}
                  </Text>
                </TouchableOpacity>

                {photosLoading ? (
                  <ActivityIndicator color={colors.accent} style={{ paddingVertical: 20 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {photos.map((p) => {
                      const selected = photoUrl === p.full;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => { setPhotoUrl(p.full); setOwnPhoto(false); setPhotoReady(false); }}
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

        {/* Póster REAL que se captura: a tamaño completo y fuera de pantalla.
            La previa de arriba va encogida con un transform, y si el transform
            estuviera en esta vista la imagen compartida saldría encogida. */}
        <View
          ref={posterRef}
          collapsable={false}
          style={{
            position: 'absolute',
            left: -10000,
            top: 0,
            width: POSTER_W,
            height: POSTER_H,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: '#111',
          }}
        >
          {posterInner}
        </View>
      </View>
    </Modal>
  );
}

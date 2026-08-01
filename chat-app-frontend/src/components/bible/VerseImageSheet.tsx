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
  ANCHORS,
  ORNAMENTS,
  fontById,
  verseBaseSize,
  hookBaseSize,
  normalizeWord,
  loadPosterFonts,
  scrimFor,
  photoPalette,
  photoShadow,
  type AlignId,
  type AnchorId,
  type OrnamentId,
  type TemplateDef,
  highlightColor,
  type FormatDef,
} from '../../lib/versePosterLayout';
import {
  tokenize,
  isSpace,
  tokenColor,
  hasStyles,
  applyStyle,
  allHave,
  pruneStyles,
  boldWeight,
  tokenSize,
  splitHook,
  tokenRange,
  MAX_HOOK_WORDS,
  WORD_COLORS,
  WORD_BGS,
  WORD_SIZES,
  type VerseStyles,
} from '../../lib/verseRichText';

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
  // Composición: a qué borde se apoya el texto, cuántas palabras van en la
  // frase destacada y con qué letra, mayúsculas del cuerpo y adorno. Es lo que
  // de verdad cambia el aspecto de la imagen (ver TEMPLATES).
  const [anchor, setAnchor] = useState<AnchorId>('center');
  const [hookWords, setHookWords] = useState(0);
  const [hookFontId, setHookFontId] = useState('caligrafica');
  const [upper, setUpper] = useState(false);
  const [ornament, setOrnament] = useState<OrnamentId>('linea');
  const [refBadge, setRefBadge] = useState(false);
  const [brandTop, setBrandTop] = useState(false);
  // Claro u oscuro sobre foto. Aquí NO hay "automático" como en la web: React
  // Native no puede leer los píxeles de la foto para medir su luminancia.
  const [photoText, setPhotoText] = useState<'light' | 'dark'>('light');
  const [highlight, setHighlight] = useState('');
  // Estilos por palabra: { [índiceDelToken]: {b,i,c,bg} }. Ver verseRichText.
  // Se indexan por posición y NO por la palabra, para poder poner en negrita
  // "Cristo" una vez y no las tres que aparezca.
  const [styles, setStyles] = useState<VerseStyles>({});
  const [sel, setSel] = useState<number[]>([]);
  const [picker, setPicker] = useState<'color' | 'bg' | null>(null);
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
  const hookFont = fontById(hookFontId);
  const usingPhoto = bgMode === 'photo' && !!photoUrl;
  const modo: 'light' | 'dark' = usingPhoto ? photoText : 'light';
  const t = usingPhoto ? photoPalette(modo) : theme;
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

  // Frase destacada + cuerpo. Mismo corte que la web (ver splitHook): los
  // índices siguen siendo los del texto completo, así que los estilos por
  // palabra valen igual a los dos lados.
  const { toks, hookEnd, bodyStart } = splitHook(text, hookWords);
  const hookItems = tokenRange(toks, 0, hookEnd);
  const bodyItems = tokenRange(toks, bodyStart, toks.length);
  const hookText = hookItems.map((it) => it.s).join('');
  const bodyText = bodyItems.map((it) => it.s).join('');
  const hasHook = hookItems.length > 0;

  // OJO: el tamaño del cuerpo lo manda la longitud del CUERPO, no la del texto
  // entero — con gancho el resto es más corto y debe crecer.
  const verseSize = s(verseBaseSize(bodyText.length, format, font, hasHook));
  const lineHeight = verseSize * 1.55 * (font.lineScale ?? 1);
  const hookSize = hasHook ? s(hookBaseSize(hookText.trim().length, hookFont)) : 0;
  // Interlineado corto: una caligráfica tiene los trazos muy altos y con el
  // 1,55 del cuerpo las líneas del gancho quedarían desparramadas.
  const hookLineHeight = hookSize * 1.06 * (hookFont.lineScale ?? 1);

  // La familia solo se aplica cuando las fuentes ya están: si no, Android
  // pinta con una familia inexistente y sale la de defecto sin avisar.
  const familiaDe = (f: typeof font) =>
    f.family
      ? fontsReady
        ? f.family
        : SERIF
      : f.id === 'moderna' || f.id === 'titular'
        ? SANS
        : SERIF;
  const verseFamily = familiaDe(font);
  const hookFamily = familiaDe(hookFont);

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

  // Los tokens del texto que se está dibujando: la lista sobre la que se
  // selecciona. Mismo `tokenize` que usa el póster, así que el índice guardado
  // aquí es el que él busca.
  const tokens = useMemo(() => tokenize(text), [text]);

  // Al editar el texto los índices se desplazan y los estilos que caen fuera
  // quedarían huérfanos: invisibles y sin forma de quitarlos (mismo problema
  // que el `highlight` de justo arriba).
  useEffect(() => {
    setStyles((s) => pruneStyles(s, text));
    setSel((s) => s.filter((i) => i < tokens.length));
  }, [text, tokens.length]);

  const toggleSel = (i: number) =>
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  const aplicar = (patch: Parameters<typeof applyStyle>[2]) =>
    setStyles((s) => applyStyle(s, sel, patch));

  // Si TODAS las seleccionadas ya lo tienen, el botón lo quita; si no, lo pone
  // — como cualquier barra de formato: con una mezcla, uniformar.
  const alternar = (key: 'b' | 'i' | 'u') =>
    aplicar({ [key]: allHave(styles, sel, key) ? null : 1 });

  // El tamaño es un valor, no un flag: pulsar la escala que ya tienen todas la
  // quita; pulsar otra la cambia.
  const allSize = (indices: number[], value: number) =>
    indices.length > 0 && indices.every((i) => styles[i]?.sz === value);
  const aplicarSize = (value: number) =>
    aplicar({ sz: allSize(sel, value) ? null : value });

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

  // Una plantilla es la COMPOSICIÓN entera, no solo color + letra: dónde se
  // apoya el texto, si hay frase destacada y con qué letra, si el cuerpo va en
  // mayúsculas y qué adorno lleva. Es lo que hace que un toque cambie de verdad
  // el aspecto (mismas plantillas que la web, ver TEMPLATES).
  const applyTemplate = (tpl: TemplateDef) => {
    setThemeId(tpl.themeId);
    setFontId(tpl.fontId);
    setAlign(tpl.align);
    setAnchor(tpl.anchor);
    setHookWords(tpl.hookWords);
    setUpper(tpl.upper);
    setOrnament(tpl.ornament);
    if (tpl.hookFontId) setHookFontId(tpl.hookFontId);
    setRefBadge(!!tpl.refBadge);
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
  // Con texto oscuro sobre foto clara hay que invertirla: una sombra oscura
  // bajo letras oscuras las emborrona en vez de despegarlas (ver photoShadow).
  const sombra = usingPhoto ? photoShadow(modo) : {};

  // Zonas reservadas del anclaje: arriba el margen (o la marca, si está), abajo
  // lo que ocupa el pie. Es lo que impide que, apoyado en un borde, el texto se
  // meta debajo de la marca. Espejo de safeTop/safeBottom en posterLayout.js.
  const safeTop = brandTop ? s(46 + 24 + 30) : s(120);
  const safeBottom = s(56 + 26 + 38);

  // Adorno separador. La web lo dibuja como un path SVG; aquí no hay
  // react-native-svg (sería módulo nativo, y entonces esto ya no llegaría por
  // `eas update`), así que se compone con Views y un carácter ♥ — mismo diseño,
  // otra técnica, como el resto del póster.
  const hoja = (giro: string) => (
    <View
      style={{
        width: s(34), height: s(15), backgroundColor: t.accent, opacity: 0.9,
        borderTopLeftRadius: s(15), borderBottomRightRadius: s(15),
        transform: [{ rotate: giro }], marginHorizontal: s(6),
      }}
    />
  );
  const barra = (ancho: number) => (
    <View style={{ width: s(ancho), height: s(3), backgroundColor: t.accent, borderRadius: s(2) }} />
  );
  const punto = (d: number) => (
    <View style={{ width: s(d), height: s(d), borderRadius: s(d) / 2, backgroundColor: t.accent }} />
  );
  const rombo = (ancho: number) => (
    <View
      style={{
        width: s(ancho), height: s(ancho), backgroundColor: t.accent,
        transform: [{ rotate: '45deg' }], marginHorizontal: s(16),
      }}
    />
  );
  // Cruz latina: dos barras cruzadas con el palo más largo por debajo.
  const cruzAdorno = (
    <View style={{ width: s(70), height: s(120), marginHorizontal: s(16), alignItems: 'center' }}>
      <View style={{ width: s(13), height: s(120), backgroundColor: t.accent }} />
      <View style={{ position: 'absolute', top: s(36), width: s(70), height: s(13), backgroundColor: t.accent }} />
    </View>
  );

  // Fila con líneas a los lados y una pieza en medio: la forma de casi todos.
  const conLineas = (medio: React.ReactNode, largoLinea: number, extra?: 'hojas' | 'laurel') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: s(30) }}>
      {extra && punto(12)}
      {extra === 'laurel' && hoja('-24deg')}
      {extra && hoja('-20deg')}
      {barra(largoLinea)}
      {extra && hoja('18deg')}
      {medio}
      {extra && hoja('-18deg')}
      {barra(largoLinea)}
      {extra && hoja('20deg')}
      {extra === 'laurel' && hoja('24deg')}
      {extra && punto(12)}
    </View>
  );

  const corazonAdorno = (
    <Text style={{ color: t.accent, fontSize: s(58), lineHeight: s(66), marginHorizontal: s(14) }}>♥</Text>
  );

  const adorno =
    ornament === 'ninguno' ? (
      <View style={{ height: s(38) }} />
    ) : ornament === 'linea' ? (
      <View style={{ width: s(96), height: s(4), backgroundColor: t.accent, borderRadius: 2, marginVertical: s(38) }} />
    ) : ornament === 'doble' ? (
      <View style={{ alignItems: 'center', marginVertical: s(34), gap: s(10) }}>
        <View style={{ width: s(210), height: s(7), backgroundColor: t.accent, borderRadius: s(4) }} />
        <View style={{ width: s(110), height: s(4), backgroundColor: t.accent, borderRadius: s(2) }} />
      </View>
    ) : ornament === 'puntos' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(26), marginVertical: s(34) }}>
        {punto(14)}
        {punto(14)}
        {punto(14)}
      </View>
    ) : ornament === 'rombo' ? (
      conLineas(rombo(26), 100)
    ) : ornament === 'corazon' ? (
      conLineas(corazonAdorno, 110)
    ) : ornament === 'cruz' ? (
      conLineas(cruzAdorno, 90)
    ) : ornament === 'hojas' ? (
      conLineas(corazonAdorno, 70, 'hojas')
    ) : (
      conLineas(rombo(24), 70, 'laurel')
    );

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

  // Estilos por palabra. Espejo de `drawLine`+`drawLineBgs` del canvas de la
  // web: mismo `tokenize`, mismo `tokenColor` y mismas paletas. Aquí no hay que
  // medir nada —React Native maqueta los <Text> anidados por su cuenta—, pero
  // el MODELO tiene que ser idéntico.
  //
  // Recibe tramos con su índice GLOBAL (ver tokenRange): con frase destacada el
  // cuerpo empieza en mitad del texto y sus estilos siguen guardados por la
  // posición en el texto completo.
  const pintarTokens = (
    items: { i: number; s: string }[],
    size: number,
    f: typeof font
  ) => {
    if (!highlight && !hasStyles(styles)) return items.map((it) => it.s).join('');
    return items.map(({ i, s: trozo }) => {
      const st = styles[i];
      const c = tokenColor(trozo, st, { highlight, highlightColor: hiColor });
      if (!st && !c) return trozo;
      return (
        <Text
          key={i}
          style={{
            color: c,
            fontWeight: st?.b ? boldWeight(f.weight) : undefined,
            fontStyle: st?.i ? 'italic' : undefined,
            textDecorationLine: st?.u ? 'underline' : undefined,
            // Tamaño relativo al del bloque (ver tokenSize). Al ir en un <Text>
            // anidado, RN lo aplica solo a esta palabra.
            fontSize: st?.sz ? tokenSize(size, st) : undefined,
            backgroundColor: st?.bg,
          }}
        >
          {trozo}
        </Text>
      );
    });
  };

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
      {/* Velo: SOLO en la franja por la que pasa el texto, apoyado en el borde
          del anclaje. Antes cubría la foto entera de arriba abajo y la dejaba
          en barro — justo lo que no hacen las imágenes que sirven de
          referencia, donde la foto se ve y solo se oscurece donde hay letras.
          Y puede ser blanco: con texto oscuro lo que hace falta es aclarar. */}
      <LinearGradient {...scrimFor(anchor, modo)} style={StyleSheet.absoluteFill} />
    </>
                ) : (
    <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}

                {/* Contenido. El anclaje se resuelve con `justifyContent` + las
                    zonas reservadas, igual que en la web. */}
                <View style={{
    flex: 1, alignItems: 'center',
    justifyContent: anchor === 'top' ? 'flex-start' : anchor === 'bottom' ? 'flex-end' : 'center',
    paddingHorizontal: s(120), paddingTop: safeTop, paddingBottom: safeBottom,
                }}>
    {/* Marca de agua arriba (el logotipo discreto de las referencias). */}
    {brandTop && (
      <Text style={{
        position: 'absolute', top: s(46), color: t.text, opacity: usingPhoto ? 0.72 : 0.5,
        fontSize: s(24), fontWeight: '600', letterSpacing: s(3), ...sombra,
      }}>holyholyholy.es</Text>
    )}

    {/* La comilla solo sin frase destacada (con ella son dos elementos grandes
        peleándose por la misma esquina) y solo si el texto NO está anclado
        arriba, que es justo donde ella vive: se solaparían. */}
    {!hasHook && anchor !== 'top' && (
      <Text style={{
        position: 'absolute', top: s(format.h > format.w ? 180 : 40), left: s(80),
        fontSize: s(300), lineHeight: s(300), color: t.accent, opacity: usingPhoto ? 0.3 : 0.18,
        fontFamily: verseFamily,
      }}>“</Text>
    )}

    {/* El bloque (versículo + línea + referencia) se desplaza en el
        formato de fondo de pantalla, para no quedar bajo los iconos. */}
    <View style={{
      alignItems,
      width: format.textWidth ? s(format.w * format.textWidth) : undefined,
      alignSelf: 'stretch',
      // `shiftY` solo cuenta centrado: apoyado en un borde, lo que manda es la
      // zona reservada de ese borde (igual que `blockTop` en la web).
      transform:
        anchor === 'center' && format.shiftY
          ? [{ translateY: format.shiftY * POSTER_H }]
          : undefined,
    }}>
      {/* Frase destacada: bloque aparte, con su tipografía, su tamaño y su
          interlineado. Es lo que da la jerarquía de las referencias. */}
      {hasHook && (
        <Text style={{
          color: t.text, fontSize: hookSize, lineHeight: hookLineHeight, textAlign,
          fontWeight: hookFont.weight ?? '400', fontFamily: hookFamily,
          // Aire hasta el cuerpo. Se mide sobre el CUERPO (no sobre el gancho,
          // que es enorme) o el hueco se comería media imagen.
          marginBottom: bodyItems.length ? verseSize * 0.75 : 0,
          ...sombra,
        }}>
          {pintarTokens(hookItems, hookSize, hookFont)}
        </Text>
      )}

      <Text style={{
        color: t.text, fontSize: verseSize, lineHeight, textAlign,
        fontWeight: font.weight ?? '400', fontFamily: verseFamily,
        // Mayúsculas + espaciado: el texto secundario de las referencias.
        textTransform: upper ? 'uppercase' : undefined,
        letterSpacing: upper ? verseSize * 0.09 : undefined,
        ...sombra,
      }}>
        {pintarTokens(bodyItems, verseSize, font)}
      </Text>

      {adorno}

      {/* Pincelada de fondo de la cita. La web la dibuja como un trazo
          irregular (SVG); aquí es una elipse translúcida — sin
          react-native-svg no hay forma de trazar esa silueta, y añadirlo
          obligaría a compilar un APK en vez de llegar por `eas update`. */}
      <View style={{ justifyContent: 'center' }}>
        {refBadge && (
          <View style={{
            position: 'absolute', left: -s(36), right: -s(36), top: -s(13), bottom: -s(13),
            borderRadius: s(40),
            backgroundColor: usingPhoto ? (modo === 'dark' ? '#ffffff' : '#000000') : t.accent,
            opacity: usingPhoto ? 0.4 : 0.22,
          }} />
        )}
        <Text style={{
          color: t.accent, fontSize: s(42), fontWeight: '800', letterSpacing: s(3),
          textAlign, textTransform: 'uppercase', ...(refBadge ? {} : sombra),
        }}>
          {reference}
        </Text>
      </View>
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
                const activa =
                  themeId === tpl.themeId &&
                  fontId === tpl.fontId &&
                  align === tpl.align &&
                  anchor === tpl.anchor &&
                  hookWords === tpl.hookWords;
                return (
                  <TouchableOpacity key={tpl.id} onPress={() => applyTemplate(tpl)} style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 54, height: 40, borderRadius: 8, overflow: 'hidden',
                      borderWidth: activa ? 3 : 1, borderColor: activa ? colors.accent : colors.border,
                    }}>
                      <LinearGradient colors={th.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
                      {/* La miniatura insinúa la COMPOSICIÓN, no solo el color:
                          dónde cae el texto y si lleva frase destacada. Con
                          solo el fondo, ocho plantillas se veían como ocho
                          colores. */}
                      <View style={{
                        ...StyleSheet.absoluteFillObject,
                        paddingHorizontal: 5, paddingVertical: 5,
                        justifyContent:
                          tpl.anchor === 'top' ? 'flex-start' : tpl.anchor === 'bottom' ? 'flex-end' : 'center',
                        alignItems:
                          tpl.align === 'left' ? 'flex-start' : tpl.align === 'right' ? 'flex-end' : 'center',
                      }}>
                        {tpl.hookWords > 0 && (
                          <View style={{ width: '70%', height: 5, borderRadius: 2, marginBottom: 2, backgroundColor: th.text, opacity: 0.9 }} />
                        )}
                        <View style={{ width: '85%', height: 2, borderRadius: 1, backgroundColor: th.text, opacity: 0.6 }} />
                        <View style={{ width: '55%', height: 2, borderRadius: 1, marginTop: 2, backgroundColor: th.text, opacity: 0.6 }} />
                      </View>
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

            {/* ── Composición ─────────────────────────────────
                Lo que de verdad cambia el aspecto: dónde se apoya el texto y
                si hay frase destacada. Va antes que la tipografía porque
                decide la imagen mucho más que la letra. */}
            <View style={{
              gap: 10, padding: 10, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
            }}>
              {/* Posición (vertical) y alineación (horizontal) van JUNTAS: son
                  la misma decisión —dónde cae el texto— y separadas se leían
                  como dos controles repetidos, porque las dos tienen "centro". */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, width: 72 }}>Posición</Text>
                {ANCHORS.map((a) => {
                  const activo = anchor === a.id;
                  return (
                    <TouchableOpacity key={a.id} onPress={() => setAnchor(a.id)} style={[chip(activo), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                      <Text style={[chipText(activo), { fontSize: 12 }]}>{a.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => setUpper((v) => !v)} style={[chip(upper), { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 'auto' }]}>
                  <Text style={[chipText(upper), { fontSize: 12 }]}>MAYÚS</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, width: 72 }}>Alineación</Text>
                {([
                  { id: 'left' as const, label: 'Izquierda' },
                  { id: 'center' as const, label: 'Centrado' },
                  { id: 'right' as const, label: 'Derecha' },
                ]).map((a) => {
                  const activo = align === a.id;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => setAlign(a.id)}
                      accessibilityLabel={a.label}
                      style={[chip(activo), { paddingHorizontal: 12, paddingVertical: 6 }]}
                    >
                      <Ionicons
                        name={a.id === 'center' ? 'reorder-three' : 'reorder-four'}
                        size={15}
                        color={activo ? '#fff' : colors.textSecondary}
                        style={{ transform: a.id === 'right' ? [{ scaleX: -1 }] : undefined }}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Frase destacada: se elige CUÁNTAS palabras, no se escribe otro
                  texto. Así no hay dos textos que mantener sincronizados y los
                  estilos por palabra siguen valiendo (ver splitHook). */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, width: 72 }}>Destacada</Text>
                <TouchableOpacity
                  onPress={() => setHookWords((n) => Math.max(0, n - 1))}
                  disabled={hookWords === 0}
                  style={[chip(false), { paddingHorizontal: 12, paddingVertical: 6, opacity: hookWords === 0 ? 0.4 : 1 }]}
                >
                  <Text style={[chipText(false), { fontSize: 14 }]}>−</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textPrimary, fontSize: 12, minWidth: 74, textAlign: 'center' }}>
                  {hookWords === 0 ? 'Ninguna' : `${hookWords} palabra${hookWords > 1 ? 's' : ''}`}
                </Text>
                <TouchableOpacity
                  onPress={() => setHookWords((n) => Math.min(MAX_HOOK_WORDS, n + 1))}
                  disabled={hookWords >= MAX_HOOK_WORDS}
                  style={[chip(false), { paddingHorizontal: 12, paddingVertical: 6, opacity: hookWords >= MAX_HOOK_WORDS ? 0.4 : 1 }]}
                >
                  <Text style={[chipText(false), { fontSize: 14 }]}>+</Text>
                </TouchableOpacity>
              </View>

              {/* La tipografía del gancho solo importa si hay gancho. */}
              {hookWords > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'center', marginRight: 6 }}>Letra</Text>
                  {FONTS.map((f) => {
                    const activo = hookFontId === f.id;
                    return (
                      <TouchableOpacity key={f.id} onPress={() => setHookFontId(f.id)} style={[chip(activo), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                        <Text style={[chipText(activo), { fontSize: 12, fontFamily: f.family && fontsReady ? f.family : undefined }]}>
                          {f.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Adorno separador */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'center', marginRight: 6 }}>Adorno</Text>
                {ORNAMENTS.map((o) => {
                  const activo = ornament === o.id;
                  return (
                    <TouchableOpacity key={o.id} onPress={() => setOrnament(o.id)} style={[chip(activo), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                      <Text style={[chipText(activo), { fontSize: 12 }]}>{o.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setRefBadge((v) => !v)} style={[chip(refBadge), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                  <Text style={[chipText(refBadge), { fontSize: 12 }]}>Fondo en la cita</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBrandTop((v) => !v)} style={[chip(brandTop), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                  <Text style={[chipText(brandTop), { fontSize: 12 }]}>Marca arriba</Text>
                </TouchableOpacity>
              </View>

              {/* Color del texto sobre foto. Sin "automático": aquí no se puede
                  medir la luminancia de la foto (ver scrimFor). */}
              {usingPhoto && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, width: 72 }}>Texto</Text>
                  {([
                    { id: 'light' as const, name: 'Claro' },
                    { id: 'dark' as const, name: 'Oscuro' },
                  ]).map((m) => {
                    const activo = photoText === m.id;
                    return (
                      <TouchableOpacity key={m.id} onPress={() => setPhotoText(m.id)} style={[chip(activo), { paddingHorizontal: 10, paddingVertical: 6 }]}>
                        <Text style={[chipText(activo), { fontSize: 12 }]}>{m.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

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

            {/* Resaltar una palabra. Va con el resto de lo que se le hace al
                TEXTO (justo encima de estilizar por palabra) y no arriba junto
                a la alineación: allí parecía parte de la composición. */}
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

            {/* ── Estilo por palabra ──────────────────────────────
                NO es un editor de texto enriquecido: se toca la palabra y se
                pulsa el estilo. Con el dedo no hay forma cómoda de seleccionar
                un rango, y el póster que se captura no es HTML. */}
            <View style={{
              borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, gap: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                  {editingText
                    ? 'Edita o acorta el texto'
                    : sel.length
                      ? `${sel.length} palabra${sel.length > 1 ? 's' : ''} seleccionada${sel.length > 1 ? 's' : ''}`
                      : 'Toca las palabras que quieras destacar'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {!editingText && hasStyles(styles) && (
                    <TouchableOpacity
                      onPress={() => { setStyles({}); setSel([]); setPicker(null); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="refresh" size={12} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Quitar</Text>
                    </TouchableOpacity>
                  )}
                  {!editingText && (
                    <TouchableOpacity
                      onPress={() => { setSel([]); setPicker(null); setEditingText(true); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="create-outline" size={13} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 12 }}>{edited ? 'Texto editado' : 'Editar texto'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {editingText ? (
                /* Modo edición: el textarea sustituye a los chips. Al terminar
                   se vuelve a estilizar; los estilos de palabras que hayan
                   desaparecido se limpian solos (pruneStyles). */
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
                    <TouchableOpacity onPress={() => setCustomText(null)} disabled={!edited}>
                      <Text style={{ color: edited ? colors.accent : colors.textMuted, fontSize: 13 }}>Restaurar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingText(false)}>
                      <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Listo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
              <>
              {/* Cada palabra se muestra con el estilo que va a tener en la
                  imagen: es lo más directo para ver qué lleva cada una sin
                  buscarla en la previa, que está arriba del todo. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {tokens.map((tok, i) => {
                  if (isSpace(tok)) return null;
                  const st = styles[i];
                  const elegida = sel.includes(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => toggleSel(i)}
                      style={{
                        paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
                        borderWidth: elegida ? 2 : 1,
                        borderColor: elegida ? colors.accent : 'transparent',
                        backgroundColor: st?.bg ?? (elegida ? undefined : colors.bgSecondary),
                      }}
                    >
                      <Text style={{
                        // Escala amortiguada en la lista: distinguir grande de
                        // pequeño basta, el póster fiel está en la previa.
                        fontSize: 14 * (st?.sz ? 1 + (st.sz - 1) * 0.5 : 1),
                        color: st?.c ?? colors.textPrimary,
                        fontWeight: st?.b ? '700' : '400',
                        fontStyle: st?.i ? 'italic' : 'normal',
                        textDecorationLine: st?.u ? 'underline' : 'none',
                      }}>
                        {tok}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* La barra solo con algo seleccionado: si no, sus botones no
                  harían nada y parecerían rotos. */}
              {sel.length > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8,
                }}>
                  <TouchableOpacity onPress={() => alternar('b')} style={chip(allHave(styles, sel, 'b'))}>
                    <Text style={[chipText(allHave(styles, sel, 'b')), { fontWeight: '700' }]}>N</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => alternar('i')} style={chip(allHave(styles, sel, 'i'))}>
                    <Text style={[chipText(allHave(styles, sel, 'i')), { fontStyle: 'italic' }]}>K</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => alternar('u')} style={chip(allHave(styles, sel, 'u'))}>
                    <Text style={[chipText(allHave(styles, sel, 'u')), { textDecorationLine: 'underline' }]}>S</Text>
                  </TouchableOpacity>

                  {/* Tamaño: cada botón conmuta su escala (volver a pulsar deja
                      la palabra en tamaño normal). Normal es no tener escala. */}
                  {WORD_SIZES.map((sz) => (
                    <TouchableOpacity key={sz.id} onPress={() => aplicarSize(sz.value)} style={chip(allSize(sel, sz.value))}>
                      <Text style={chipText(allSize(sel, sz.value))}>{sz.label}</Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    onPress={() => setPicker((p) => (p === 'color' ? null : 'color'))}
                    style={chip(picker === 'color')}
                  >
                    <Text style={chipText(picker === 'color')}>Color</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPicker((p) => (p === 'bg' ? null : 'bg'))}
                    style={chip(picker === 'bg')}
                  >
                    <Text style={chipText(picker === 'bg')}>Fondo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSel([])} style={{ marginLeft: 'auto' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Deseleccionar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {sel.length > 0 && picker && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {(picker === 'color' ? WORD_COLORS : WORD_BGS).map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => aplicar({ [picker === 'color' ? 'c' : 'bg']: c })}
                      style={{
                        width: 24, height: 24, borderRadius: 12, backgroundColor: c,
                        borderWidth: 1, borderColor: colors.border,
                      }}
                      accessibilityLabel={c}
                    />
                  ))}
                  {/* Volver al color del tema (o a sin fondo) sin perder los
                      demás estilos de la palabra. */}
                  <TouchableOpacity onPress={() => aplicar({ [picker === 'color' ? 'c' : 'bg']: null })}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Ninguno</Text>
                  </TouchableOpacity>
                </View>
              )}
              </>
              )}
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

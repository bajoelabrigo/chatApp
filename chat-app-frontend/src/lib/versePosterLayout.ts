import * as Font from 'expo-font';

// Diseño del póster de versículos en la app.
//
// ESPEJO de `holy_app/frontend/src/lib/posterLayout.js`. Los dos describen el
// MISMO diseño, pero no se puede compartir el código: la web lo dibuja con
// Canvas 2D y la app renderiza una vista real que captura react-native-view-shot.
// Al tocar formatos, tipografías o plantillas, cambiar los dos o las imágenes
// dejarán de parecerse.

export interface FormatDef {
  id: string;
  name: string;
  sub: string;
  w: number;
  h: number;
  /** Fracción del alto que se sube el bloque de texto (fondo de pantalla). */
  shiftY?: number;
  /** Ancho del texto como fracción del lienzo. */
  textWidth?: number;
}

export const FORMATS: FormatDef[] = [
  { id: 'square', name: 'Cuadrado', sub: 'Post', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Vertical', sub: 'Feed', w: 1080, h: 1350 },
  { id: 'story', name: 'Historia', sub: 'Stories', w: 1080, h: 1920 },
  { id: 'landscape', name: 'Proyector', sub: '16:9', w: 1920, h: 1080, textWidth: 0.72 },
  { id: 'wallpaper', name: 'Fondo', sub: 'Móvil', w: 1170, h: 2532, shiftY: -0.08 },
];

export interface FontDef {
  id: string;
  name: string;
  /** `fontFamily` de React Native. Vacío = la del sistema. */
  family?: string;
  weight?: '400' | '600' | '700';
  sizeScale?: number;
  lineScale?: number;
}

// Las tres propias son las MISMAS que la web (licencia OFL, en assets/fonts).
// Sin ellas cargadas se cae a la del sistema, que es lo que había antes.
export const FONTS: FontDef[] = [
  { id: 'clasica', name: 'Clásica' },
  // La caligráfica de pincel: la de la frase destacada. Trazos finos y altura
  // de x diminuta, de ahí el sizeScale alto y el interlineado corto.
  { id: 'caligrafica', name: 'Caligráfica', family: 'GreatVibes', sizeScale: 1.5, lineScale: 0.74 },
  // OJO — en la web esta es Montserrat; aquí NO se empaqueta (su .ttf solo
  // existe como fuente variable, 745 KB, y en Android el peso variable no es
  // fiable). Cae en la sans del sistema, que para un cuerpo en mayúsculas
  // espaciadas se parece bastante. Es la única divergencia con la web.
  { id: 'titular', name: 'Titular', family: undefined, weight: '600', sizeScale: 0.94 },
  { id: 'elegante', name: 'Elegante', family: 'PlayfairDisplay', sizeScale: 0.97 },
  { id: 'moderna', name: 'Moderna', family: undefined },
  { id: 'impacto', name: 'Impacto', family: 'Oswald', weight: '600' },
  // Caveat tiene la altura de x mucho menor: al mismo tamaño se ve pequeña.
  { id: 'manuscrita', name: 'Manuscrita', family: 'Caveat', weight: '600', sizeScale: 1.42, lineScale: 0.82 },
];

export type AlignId = 'left' | 'center' | 'right';
export type AnchorId = 'top' | 'center' | 'bottom';
export type OrnamentId =
  | 'linea'
  | 'doble'
  | 'puntos'
  | 'rombo'
  | 'corazon'
  | 'cruz'
  | 'hojas'
  | 'laurel'
  | 'ninguno';

// Plantillas: COMPOSICIONES enteras, no solo color + letra. Espejo de TEMPLATES
// en VerseImageModal.jsx — al tocar una, tocar las dos o las imágenes de la web
// y las de la app dejarán de parecerse.
export interface TemplateDef {
  id: string;
  name: string;
  themeId: string;
  fontId: string;
  align: AlignId;
  anchor: AnchorId;
  hookWords: number;
  upper: boolean;
  ornament: OrnamentId;
  hookFontId?: string;
  refBadge?: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'clasico', name: 'Clásico', themeId: 'noche', fontId: 'clasica', align: 'center', anchor: 'center', hookWords: 0, upper: false, ornament: 'linea' },
  { id: 'destacado', name: 'Destacado', themeId: 'noche', fontId: 'titular', hookFontId: 'caligrafica', hookWords: 1, upper: true, align: 'center', anchor: 'bottom', ornament: 'linea' },
  { id: 'devocional', name: 'Devocional', themeId: 'crema', fontId: 'titular', hookFontId: 'caligrafica', hookWords: 3, upper: true, align: 'center', anchor: 'center', ornament: 'hojas', refBadge: true },
  { id: 'editorial', name: 'Editorial', themeId: 'crema', fontId: 'elegante', align: 'left', anchor: 'center', hookWords: 0, upper: false, ornament: 'linea' },
  { id: 'titular', name: 'Titular', themeId: 'vino', fontId: 'impacto', align: 'left', anchor: 'top', hookWords: 0, upper: false, ornament: 'linea' },
  { id: 'sereno', name: 'Sereno', themeId: 'cielo', fontId: 'moderna', align: 'center', anchor: 'center', hookWords: 0, upper: false, ornament: 'corazon' },
  { id: 'diario', name: 'Diario', themeId: 'bosque', fontId: 'manuscrita', align: 'center', anchor: 'center', hookWords: 0, upper: false, ornament: 'linea' },
  { id: 'aurora', name: 'Aurora', themeId: 'amanecer', fontId: 'titular', hookFontId: 'caligrafica', hookWords: 2, upper: true, align: 'center', anchor: 'bottom', ornament: 'corazon' },
];

export const ANCHORS: { id: AnchorId; name: string }[] = [
  { id: 'top', name: 'Arriba' },
  { id: 'center', name: 'Centro' },
  { id: 'bottom', name: 'Abajo' },
];

// Mismos adornos que la web (ver ORNAMENTS en posterLayout.js) y en el mismo
// orden. Allí cada uno es UN path SVG; aquí se componen con Views, porque no
// hay react-native-svg — y añadirlo sería un módulo nativo, o sea que esto ya no
// llegaría por `eas update`. Mismo diseño, otra técnica.
export const ORNAMENTS: { id: OrnamentId; name: string }[] = [
  { id: 'linea', name: 'Línea' },
  { id: 'doble', name: 'Doble' },
  { id: 'puntos', name: 'Puntos' },
  { id: 'rombo', name: 'Rombo' },
  { id: 'corazon', name: 'Corazón' },
  { id: 'cruz', name: 'Cruz' },
  { id: 'hojas', name: 'Hojas' },
  { id: 'laurel', name: 'Laurel' },
  { id: 'ninguno', name: 'Ninguno' },
];

export const fontById = (id: string) => FONTS.find((f) => f.id === id) || FONTS[0];

// ── Color de la palabra resaltada ─────────────────────────────
// Espejo de `highlightColor` en posterLayout.js de la web.
//
// NO vale el acento del tema sin más: está pensado para la línea y la
// referencia, que van sueltas, pero dentro de un párrafo de texto blanco hay
// acentos que no se distinguen — "amanecer", "lavanda" y "coral" lo tienen en
// #ffffff (el MISMO que el texto) y "cielo", "bosque" y "menta" casi. Sobre
// foto pasa igual: el acento se vuelve blanco. Se mide el contraste y, si no
// llega, se usa un respaldo que sí recorta.
export const HIGHLIGHT_LIGHT = '#ffd166';
export const HIGHLIGHT_DARK = '#b3701f';

function luminance(hex: string) {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return 1;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const canal = (v: string) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(h.slice(0, 2)) + 0.7152 * canal(h.slice(2, 4)) + 0.0722 * canal(h.slice(4, 6));
}

const contraste = (a: string, b: string) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export function highlightColor(t: { text: string; accent: string }, onPhoto: boolean) {
  const respaldo = luminance(t.text) > 0.5 ? HIGHLIGHT_LIGHT : HIGHLIGHT_DARK;
  if (onPhoto) return respaldo;
  return contraste(t.accent, t.text) >= 1.35 ? t.accent : respaldo;
}

// Carga las fuentes propias. Se llama al ABRIR la hoja y no al arrancar la app:
// son 850 KB que solo necesita quien comparte una imagen.
//
// Va por `Font.loadAsync` (no por un build nativo) precisamente para que llegue
// por `eas update`: los .ttf son assets del bundle de JS.
let cargando: Promise<void> | null = null;
export function loadPosterFonts(): Promise<void> {
  if (!cargando) {
    cargando = Font.loadAsync({
      PlayfairDisplay: require('../../assets/fonts/PlayfairDisplay.ttf'),
      Oswald: require('../../assets/fonts/Oswald.ttf'),
      Caveat: require('../../assets/fonts/Caveat.ttf'),
      GreatVibes: require('../../assets/fonts/GreatVibes.ttf'),
    }).catch(() => {
      // Si fallan, el póster usa la tipografía del sistema. Es peor, pero se
      // sigue pudiendo compartir: no vale la pena romper la pantalla por esto.
      cargando = null;
    });
  }
  return cargando;
}

// Tamaño del versículo. Misma curva que la web; `sizeScale` compensa que cada
// familia ocupa distinto al mismo tamaño en píxeles.
export function verseBaseSize(len: number, format: FormatDef, font?: FontDef, hasHook?: boolean) {
  const tall = format.h > format.w;
  let s: number;
  if (len <= 60) s = 70;
  else if (len <= 110) s = 60;
  else if (len <= 180) s = 51;
  else if (len <= 260) s = 44;
  else if (len <= 360) s = 38;
  else if (len <= 480) s = 33;
  else s = 28;
  if (tall) s += 6;
  // Con frase destacada el cuerpo deja de ser el protagonista y se encoge: si
  // se quedara igual de grande competiría con el gancho y se perdería justo la
  // jerarquía que se busca.
  if (hasHook) s *= 0.74;
  return s * (font?.sizeScale ?? 1);
}

// Tamaño de la frase destacada. Espejo de `hookFontSize` en la web.
//
// No hace falta encogerla para que quepa: se parte en líneas como el cuerpo
// (aquí lo hace React Native solo), que es lo que hacen las referencias cuando
// el gancho es largo ("No se preocupen / por nada; en cambio,").
export function hookBaseSize(len: number, font?: FontDef) {
  let s: number;
  if (len <= 8) s = 170;
  else if (len <= 14) s = 142;
  else if (len <= 22) s = 118;
  else if (len <= 34) s = 97;
  else s = 80;
  return s * (font?.sizeScale ?? 1);
}

// ── Velo de la foto ───────────────────────────────────────────
// Espejo de `scrimFor` en la web, adaptado a LinearGradient (que quiere colores
// y `locations` por separado en vez de paradas).
//
// El velo iba sobre TODA la foto de arriba abajo y la dejaba en barro. Ahora se
// apoya en el borde del anclaje y se desvanece hacia el otro, así la foto se ve.
//
// OJO: aquí no se puede MEDIR la foto (React Native no lee los píxeles sin otra
// dependencia nativa), así que no hay modo "automático" como en la web: el
// usuario elige claro u oscuro y se asume una foto media.
export function scrimFor(anchor: AnchorId, textMode: 'light' | 'dark') {
  const oscuro = textMode !== 'dark';
  const need = oscuro ? 0.5 : 0.48;
  const rgb = oscuro ? '0,0,0' : '255,255,255';
  let stops: [number, number][];
  if (anchor === 'bottom') {
    stops = [[0, 0], [0.4, need * 0.1], [0.68, need * 0.6], [1, need]];
  } else if (anchor === 'top') {
    stops = [[0, need], [0.32, need * 0.6], [0.6, need * 0.1], [1, 0]];
  } else {
    stops = [[0, need * 0.18], [0.24, need * 0.72], [0.5, need], [0.76, need * 0.72], [1, need * 0.18]];
  }
  return {
    colors: stops.map(([, a]) => `rgba(${rgb},${a.toFixed(3)})`) as unknown as [string, string, ...string[]],
    locations: stops.map(([at]) => at) as unknown as [number, number, ...number[]],
  };
}

/** Colores del texto sobre foto. Espejo de `photoPalette` en la web. */
export function photoPalette(textMode: 'light' | 'dark') {
  return textMode === 'dark'
    ? { text: '#1a1712', accent: '#1a1712', sub: 'rgba(26,23,18,0.74)' }
    : { text: '#ffffff', accent: '#ffffff', sub: 'rgba(255,255,255,0.92)' };
}

/**
 * Sombra del texto sobre foto. Con texto oscuro hay que invertirla: una sombra
 * oscura bajo letras oscuras las emborrona en vez de despegarlas.
 */
export function photoShadow(textMode: 'light' | 'dark') {
  return {
    textShadowColor: textMode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  };
}

// Normaliza una palabra para compararla: sin tildes, sin mayúsculas y sin la
// puntuación pegada. Espejo de `normalizeWord` en versePoster.js de la web.
export function normalizeWord(w: string) {
  return String(w || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

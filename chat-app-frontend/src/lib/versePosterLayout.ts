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
  { id: 'elegante', name: 'Elegante', family: 'PlayfairDisplay', sizeScale: 0.97 },
  { id: 'moderna', name: 'Moderna', family: undefined },
  { id: 'impacto', name: 'Impacto', family: 'Oswald', weight: '600' },
  // Caveat tiene la altura de x mucho menor: al mismo tamaño se ve pequeña.
  { id: 'manuscrita', name: 'Manuscrita', family: 'Caveat', weight: '600', sizeScale: 1.42, lineScale: 0.82 },
];

export const TEMPLATES = [
  { id: 'clasico', name: 'Clásico', themeId: 'noche', fontId: 'clasica', align: 'center' as const },
  { id: 'editorial', name: 'Editorial', themeId: 'crema', fontId: 'elegante', align: 'left' as const },
  { id: 'titular', name: 'Titular', themeId: 'vino', fontId: 'impacto', align: 'left' as const },
  { id: 'sereno', name: 'Sereno', themeId: 'cielo', fontId: 'moderna', align: 'center' as const },
  { id: 'diario', name: 'Diario', themeId: 'bosque', fontId: 'manuscrita', align: 'center' as const },
  { id: 'aurora', name: 'Aurora', themeId: 'amanecer', fontId: 'elegante', align: 'center' as const },
];

export type AlignId = 'left' | 'center' | 'right';

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
export function verseBaseSize(len: number, format: FormatDef, font?: FontDef) {
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
  return s * (font?.sizeScale ?? 1);
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

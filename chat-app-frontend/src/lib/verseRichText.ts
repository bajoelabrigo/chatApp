// Estilos por palabra dentro del versículo (negrita, cursiva, color, fondo).
//
// ESPEJO de `holy_app/frontend/src/lib/verseRichText.js`. Al tocar las reglas,
// editar los dos o la misma imagen saldrá distinta en la web y en la app.
//
// Aquí la parte de dibujo es casi gratis —React Native ya sabe anidar <Text>
// con fontWeight, fontStyle, color y backgroundColor—, mientras que en la web
// hay que medir y pintar cada palabra a mano en el canvas. Lo que SÍ tiene que
// ser idéntico es el modelo: cómo se parte el texto y qué gana sobre qué.

/** b negrita · i cursiva · u subrayado · c color · bg fondo · sz escala */
export interface TokenStyle {
  b?: 1;
  i?: 1;
  u?: 1;
  c?: string;
  bg?: string;
  sz?: number;
}

export type VerseStyles = Record<number, TokenStyle>;

// Un token es una palabra O un bloque de espacios. El índice del token es la
// clave de los estilos, así que la web y la app tienen que partir el texto
// EXACTAMENTE igual o cada una pondría en negrita una palabra distinta.
export function tokenize(text: string): string[] {
  return String(text || '')
    .split(/(\s+)/)
    .filter((s) => s !== '');
}

export const isSpace = (tok: string) => /^\s+$/.test(tok);

/** Sin tildes, sin mayúsculas y sin la puntuación pegada ("fortalece." y
 *  "Fortalece" son la misma palabra). */
export function normalizeWord(w: string) {
  return String(w || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/**
 * Color de un token. El elegido a mano GANA sobre el resaltado automático por
 * palabra: si no, marcar una palabra en rojo no haría nada en cuanto esa
 * palabra fuera además la resaltada.
 */
export function tokenColor(
  tok: string,
  st: TokenStyle | undefined,
  o: { highlight?: string; highlightColor: string; textColor?: string }
): string | undefined {
  if (st?.c) return st.c;
  if (o.highlight && !isSpace(tok) && normalizeWord(tok) === normalizeWord(o.highlight)) {
    return o.highlightColor;
  }
  return o.textColor;
}

export function hasStyles(styles?: VerseStyles) {
  return !!styles && Object.keys(styles).length > 0;
}

/**
 * Aplica un cambio a un conjunto de índices. Un valor nulo BORRA la propiedad, y
 * el token que se queda sin ninguna desaparece del objeto: si no, se irían
 * acumulando entradas vacías y `hasStyles` diría que sí para siempre.
 */
export function applyStyle(
  styles: VerseStyles,
  indices: number[],
  patch: Partial<Record<keyof TokenStyle, string | number | 1 | null>>
): VerseStyles {
  const out: VerseStyles = { ...(styles || {}) };
  for (const i of indices) {
    const next: TokenStyle = { ...(out[i] || {}) };
    for (const [k, v] of Object.entries(patch)) {
      // `null` es cómo se pide BORRAR una propiedad (quitar la negrita, volver
      // al color del tema). En la web el tipo admite además `false`; aquí el
      // tipado ya lo descarta, así que comprobarlo sería código muerto.
      if (v === null || v === undefined) delete (next as any)[k];
      else (next as any)[k] = v;
    }
    if (Object.keys(next).length) out[i] = next;
    else delete out[i];
  }
  return out;
}

/** ¿Están TODOS los índices con esta propiedad puesta? (estado del botón N/K) */
export function allHave(styles: VerseStyles, indices: number[], key: keyof TokenStyle) {
  return indices.length > 0 && indices.every((i) => styles?.[i]?.[key]);
}

/**
 * Descarta los estilos que apuntan a tokens que ya no existen: el texto es
 * editable a mano y, al recortarlo, los de después del corte quedarían
 * huérfanos — invisibles y sin forma de quitarlos.
 */
export function pruneStyles(styles: VerseStyles, text: string): VerseStyles {
  if (!hasStyles(styles)) return styles || {};
  const n = tokenize(text).length;
  const out: VerseStyles = {};
  for (const [k, v] of Object.entries(styles)) {
    if (Number(k) < n) out[Number(k)] = v;
  }
  return out;
}

// ── Frase destacada ───────────────────────────────────────────
// Espejo de `splitHook` en la web (holy_app/frontend/src/lib/verseRichText.js).
//
// El gancho NO es un texto aparte: son las N PRIMERAS PALABRAS del mismo texto.
// Guardar solo el número evita tener el mismo texto en dos sitios (editar el
// versículo dejaría el gancho apuntando a palabras que ya no están) y mantiene
// los índices de los tokens, que son la clave de los estilos por palabra.
export const MAX_HOOK_WORDS = 6;

export function splitHook(text: string, hookWords: number) {
  const toks = tokenize(text);
  const n = Math.max(0, Math.min(MAX_HOOK_WORDS, Number(hookWords) || 0));
  if (!n) return { toks, hookEnd: 0, bodyStart: 0 };

  let palabras = 0;
  let i = 0;
  for (; i < toks.length; i++) {
    if (isSpace(toks[i])) continue;
    palabras++;
    if (palabras >= n) {
      i++;
      break;
    }
  }
  const hookEnd = i;
  let bodyStart = hookEnd;
  while (bodyStart < toks.length && isSpace(toks[bodyStart])) bodyStart++;
  // Si el gancho se come el texto entero no hay jerarquía que enseñar: se trata
  // como si no hubiera gancho, en vez de dejar el cuerpo vacío.
  if (bodyStart >= toks.length) return { toks, hookEnd: 0, bodyStart: 0 };
  return { toks, hookEnd, bodyStart };
}

/** Los tokens de un tramo, con su índice GLOBAL (la clave de los estilos). */
export function tokenRange(toks: string[], from: number, to: number) {
  const out: { i: number; s: string }[] = [];
  for (let i = from; i < to; i++) out.push({ i, s: toks[i] });
  return out;
}

// Paletas — MISMOS valores que la web (WORD_COLORS / WORD_BGS en posterLayout.js).
export const WORD_COLORS = [
  '#ffd166', '#f59e0b', '#fb7185', '#ef4444', '#34d399',
  '#38bdf8', '#c084fc', '#ffffff', '#111827',
];

// Translúcidos a propósito: sobre una foto, un bloque opaco tapa la imagen y
// parece un error de maquetación.
export const WORD_BGS = [
  'rgba(250,204,21,0.85)', 'rgba(52,211,153,0.8)', 'rgba(56,189,248,0.8)',
  'rgba(244,114,182,0.8)', 'rgba(192,132,252,0.8)', 'rgba(0,0,0,0.55)',
];

// "Negrita" no es 700 fijo: "Impacto" y "Manuscrita" YA nacen a 600 y ponerles
// 700 apenas se notaría. Se suma un salto sobre el peso base, con tope en 900.
// Mismo cálculo que la web (`boldWeight` en posterLayout.js): base + 300, tope
// 900. Se compara en número, no en texto: '400' >= '600' como cadenas es una
// comparación lexicográfica que da la respuesta correcta por casualidad y deja
// de darla en cuanto aparezca un peso de tres cifras distinto.
export function boldWeight(weight?: string): '700' | '900' {
  const base = Number(weight) || 400;
  return Math.min(900, base + 300) >= 900 ? '900' : '700';
}

// Tamaños relativos (multiplicadores). Espejo de WORD_SIZES en la web; el tope
// es 1.5 por lo mismo: por encima, la palabra pisa la línea de arriba.
export const WORD_SIZES = [
  { id: 'pequena', label: 'A−', value: 0.8 },
  { id: 'grande', label: 'A+', value: 1.25 },
  { id: 'enorme', label: 'A++', value: 1.5 },
];

/** Tamaño en px de un token con su escala aplicada. */
export function tokenSize(size: number, st?: TokenStyle) {
  return Math.round(size * (st?.sz || 1));
}

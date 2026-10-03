// Colores de resaltado CON SIGNIFICADO (backlog de pulido).
//
// Antes eran solo colores; ahora cada uno tiene una lectura ("¿por qué subrayé
// esto?"). Misma paleta que la web (holy_app/frontend/src/lib/highlightPalette.js):
// si se toca aquí, tocar allí.
//
// Los resaltados ya guardados se identifican por su hex, así que los antiguos
// (la paleta vieja del móvil era otra) se siguen pintando igual; simplemente no
// tienen significado asociado.
export interface HighlightColor {
  value: string;
  name: string;
  meaning: string;
  /** Letra encima del resaltado; sin ella, la oscura de siempre. */
  ink?: string;
}

export const HIGHLIGHT_PALETTE: HighlightColor[] = [
  { value: '#FEF08A', name: 'Amarillo', meaning: 'Promesa' },
  { value: '#BBF7D0', name: 'Verde', meaning: 'Mandato' },
  { value: '#BFDBFE', name: 'Azul', meaning: 'Enseñanza' },
  { value: '#FBCFE8', name: 'Rosa', meaning: 'Oración' },
  { value: '#FED7AA', name: 'Naranja', meaning: 'Advertencia' },
  { value: '#E9D5FF', name: 'Morado', meaning: 'Consuelo' },
  // Los dos fuertes (2026-10-03) llevan LETRA BLANCA y se pintan OPACOS: con la
  // transparencia de los pastel ('AA') el azul y el rojo quedan lavados y el
  // blanco deja de leerse. Lo deciden `inkOf`/`highlightBg`, nunca a mano.
  { value: '#1D4ED8', name: 'Azul intenso', meaning: 'Fe', ink: '#FFFFFF' },
  { value: '#DC2626', name: 'Rojo', meaning: 'Salvación', ink: '#FFFFFF' },
];

export const HIGHLIGHT_INK = '#1f2937';

const find = (hex: string) =>
  HIGHLIGHT_PALETTE.find((c) => c.value.toLowerCase() === (hex || '').toLowerCase());

/** Color de la letra sobre un resaltado (también los colores viejos). */
export const inkOf = (hex: string): string => find(hex)?.ink ?? HIGHLIGHT_INK;

/** Fondo del versículo resaltado: los pastel con transparencia, los fuertes opacos. */
export const highlightBg = (hex: string, alpha: string): string =>
  find(hex)?.ink ? hex : hex + alpha;

export const meaningOf = (hex: string): string =>
  HIGHLIGHT_PALETTE.find((c) => c.value.toLowerCase() === (hex || '').toLowerCase())
    ?.meaning ?? '';

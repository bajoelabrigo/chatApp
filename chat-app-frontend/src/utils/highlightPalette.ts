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
}

export const HIGHLIGHT_PALETTE: HighlightColor[] = [
  { value: '#FEF08A', name: 'Amarillo', meaning: 'Promesa' },
  { value: '#BBF7D0', name: 'Verde', meaning: 'Mandato' },
  { value: '#BFDBFE', name: 'Azul', meaning: 'Enseñanza' },
  { value: '#FBCFE8', name: 'Rosa', meaning: 'Oración' },
  { value: '#FED7AA', name: 'Naranja', meaning: 'Advertencia' },
  { value: '#E9D5FF', name: 'Morado', meaning: 'Consuelo' },
];

export const meaningOf = (hex: string): string =>
  HIGHLIGHT_PALETTE.find((c) => c.value.toLowerCase() === (hex || '').toLowerCase())
    ?.meaning ?? '';

// Búsqueda insensible a mayúsculas y a tildes (backlog de pulido de la Biblia).
//
// `fold` quita las tildes CONSERVANDO LA LONGITUD del texto: cada letra
// acentuada precompuesta ("ó") se descompone en base + marca y la marca se
// borra, así que vuelve a ocupar un carácter. Gracias a eso, la posición de una
// coincidencia sobre el texto plegado sigue valiendo sobre el texto ORIGINAL, y
// se puede resaltar el término sin descuadrar los índices.
//
// Espejo en la web (holy_app/frontend/src/lib/textFold.js) y en el backend
// (`fold` en bibleController.ts). Al tocar uno, tocar los tres.
export const fold = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * Parte un texto marcando las coincidencias del término buscado (ignorando
 * tildes y mayúsculas). Si el plegado alterase la longitud (texto ya
 * descompuesto), devuelve el texto sin marcar: mejor sin resaltado que con el
 * resaltado corrido de sitio.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const src = text || '';
  const q = fold(query).trim();
  if (!q) return [{ text: src, hit: false }];

  const folded = fold(src);
  if (folded.length !== src.length) return [{ text: src, hit: false }];

  const parts: TextPart[] = [];
  let i = 0;
  let at = folded.indexOf(q);
  while (at !== -1) {
    if (at > i) parts.push({ text: src.slice(i, at), hit: false });
    parts.push({ text: src.slice(at, at + q.length), hit: true });
    i = at + q.length;
    at = folded.indexOf(q, i);
  }
  if (i < src.length) parts.push({ text: src.slice(i), hit: false });
  return parts;
}

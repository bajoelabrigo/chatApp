// Formato de texto estilo WhatsApp para el chat:
//   *negrita* o **negrita**, _cursiva_, ~tachado~
// Devuelve segmentos con flags de estilo para renderizar <Text> anidados.
// El mismo parser (en JS) vive en holy_app/frontend/src/utils/extraLinkChat.js
// para que web y móvil formateen igual; al tocar las reglas, editar ambos.

export type FmtSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
};

type FmtStyle = "bold" | "italic" | "strike";

// El orden importa: ** antes que * para que la negrita de dos asteriscos gane.
// El interior no puede contener su propio delimitador ni salto de línea y debe
// empezar/terminar en un carácter que no sea espacio (igual que WhatsApp).
const RULES: { style: FmtStyle; re: RegExp }[] = [
  { style: "bold", re: /^\*\*(\S|\S[^\n*]*?\S)\*\*/ },
  { style: "bold", re: /^\*(\S|\S[^\n*]*?\S)\*/ },
  { style: "italic", re: /^_(\S|\S[^\n_]*?\S)_/ },
  { style: "strike", re: /^~(\S|\S[^\n~]*?\S)~/ },
];

export function parseFormatting(
  text: string,
  ctx: Omit<FmtSegment, "text"> = {}
): FmtSegment[] {
  const out: FmtSegment[] = [];
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer) {
      out.push({ text: buffer, ...ctx });
      buffer = "";
    }
  };
  while (i < text.length) {
    const rest = text.slice(i);
    let matched: { m: RegExpExecArray; style: FmtStyle } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m) {
        matched = { m, style: rule.style };
        break;
      }
    }
    if (matched) {
      flush();
      // Recursivo: permite anidar (p.ej. *negrita con _cursiva_ dentro*).
      out.push(
        ...parseFormatting(matched.m[1], { ...ctx, [matched.style]: true })
      );
      i += matched.m[0].length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  flush();
  return out;
}

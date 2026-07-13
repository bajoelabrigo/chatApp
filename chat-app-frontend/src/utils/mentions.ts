// Menciones (@nombre) en los grupos.
//
// El texto conserva "@Pedro" para leerse, pero lo que viaja al servidor es la
// LISTA DE IDS de los mencionados. No se resuelven los nombres en el backend a
// posteriori a propósito: con dos "Pedro" en el grupo, o con un nombre que lleva
// espacios ("Ana María"), buscar "@Pedro" en el texto es ambiguo y acabaría
// avisando a quien no era. Aquí sabemos exactamente a quién eligió el usuario.
//
// Espejo en la web: holy_app/frontend/src/lib/mentions.js — al tocar el regex o
// las reglas, cambiar los dos.

export interface MentionUser {
  _id: string;
  name: string;
  avatar?: string;
}

/**
 * ¿Está el usuario escribiendo una mención justo ahora?
 *
 * Devuelve lo que lleva escrito tras la @ (para filtrar la lista) y dónde empieza
 * la @, o null si el cursor no está dentro de una mención.
 *
 * La @ solo cuenta al principio del texto o después de un espacio: así una
 * dirección de correo ("juan@gmail.com") no abre el autocompletado.
 */
export function activeMentionQuery(
  text: string,
  cursor: number
): { query: string; start: number } | null {
  const upToCursor = text.slice(0, cursor);
  const at = upToCursor.lastIndexOf('@');
  if (at < 0) return null;

  const before = at > 0 ? upToCursor[at - 1] : ' ';
  if (before !== ' ' && before !== '\n') return null;

  const query = upToCursor.slice(at + 1);
  // Un salto de línea cierra la mención. El espacio NO, porque hay nombres
  // compuestos ("Ana María"): mientras siga habiendo candidatos, se sigue
  // filtrando. Se corta a 30 caracteres para no buscar en un párrafo entero.
  if (query.includes('\n') || query.length > 30) return null;

  return { query, start: at };
}

/** Los participantes cuyo nombre empieza por lo escrito (sin tildes ni mayúsculas). */
export function filterMentionCandidates(
  users: MentionUser[],
  query: string,
  limit = 6
): MentionUser[] {
  const q = fold(query);
  if (!q) return users.slice(0, limit);
  return users
    .filter((u) => fold(u.name).includes(q))
    .slice(0, limit);
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Inserta la mención en el texto, sustituyendo lo que se llevara escrito tras la @.
 * Devuelve el texto nuevo y la posición donde dejar el cursor.
 */
export function applyMention(
  text: string,
  start: number,
  cursor: number,
  user: MentionUser
): { text: string; cursor: number } {
  const before = text.slice(0, start);
  const after = text.slice(cursor);
  const inserted = `@${user.name} `;
  return {
    text: before + inserted + after,
    cursor: before.length + inserted.length,
  };
}

/**
 * Quiénes quedan realmente mencionados en el texto FINAL.
 *
 * Se recalcula al enviar (no basta con ir apuntando los elegidos): el usuario
 * pudo borrar el "@Pedro" después de escribirlo, y avisar a Pedro de un mensaje
 * donde ya no aparece sería desconcertante.
 *
 * Se apoya en `splitMentions`, que RECORRE el texto consumiéndolo. Buscar cada
 * nombre por separado (un `includes` por usuario) parecía equivalente y no lo es:
 * con "Ana" y "Ana María" en el grupo, escribir "@Ana María" contenía también
 * "@Ana" y acababa notificando a Ana. Esa falsa alarma es justo lo que hace que
 * la gente silencie el grupo, así que la mención tiene que ser exacta.
 */
export function resolveMentions(text: string, users: MentionUser[]): string[] {
  return [
    ...new Set(
      splitMentions(text, users)
        .map((p) => p.mentionOf)
        .filter((id): id is string => !!id)
    ),
  ];
}

/**
 * Parte el texto en trozos, marcando cuáles son menciones, para pintarlas
 * resaltadas en la burbuja.
 */
export interface TextPiece {
  text: string;
  mentionOf?: string; // userId mencionado
}

export function splitMentions(text: string, users: MentionUser[]): TextPiece[] {
  if (!users.length) return [{ text }];

  // Nombres más largos primero: si no, "@Ana" se comería el principio de
  // "@Ana María" y el resto quedaría suelto.
  const byLength = [...users].sort((a, b) => b.name.length - a.name.length);

  const pieces: TextPiece[] = [];
  let rest = text;

  while (rest.length) {
    let best: { index: number; user: MentionUser } | null = null;

    for (const u of byLength) {
      const i = fold(rest).indexOf(fold(`@${u.name}`));
      if (i >= 0 && (!best || i < best.index)) best = { index: i, user: u };
    }

    if (!best) {
      pieces.push({ text: rest });
      break;
    }

    if (best.index > 0) pieces.push({ text: rest.slice(0, best.index) });
    const len = best.user.name.length + 1; // + la @
    pieces.push({
      text: rest.slice(best.index, best.index + len),
      mentionOf: best.user._id,
    });
    rest = rest.slice(best.index + len);
  }

  return pieces;
}

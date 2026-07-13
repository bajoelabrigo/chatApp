import { useMemo, useState } from 'react';
import {
  activeMentionQuery,
  filterMentionCandidates,
  applyMention,
  resolveMentions,
  type MentionUser,
} from '../utils/mentions';

// Menciones (@nombre) en el input del chat.
//
// Estaba repartido por `app/chat/[id].tsx`: el cursor, la consulta activa, los
// candidatos, DOS listas de usuarios distintas y el insertar. Juntarlo aquí no es
// solo orden — es que la diferencia entre esas dos listas es sutil y se presta a
// equivocarse:
//
//   · `mentionable` (sin mí): a quién puedo mencionar AL ESCRIBIR. Mencionarse a
//     uno mismo no tiene sentido, y el backend lo descarta igualmente.
//   · `all` (conmigo): con quién se RESALTA el texto al pintarlo. En un mensaje
//     ajeno que me menciona, el nombre a resaltar es justamente el mío — si aquí
//     usáramos `mentionable`, mi propia mención sería la única que no se vería.
//
// Lo que viaja al servidor son los IDS, no el texto: con dos "Pedro" en el grupo,
// buscar "@Pedro" en el mensaje sería ambiguo.

interface Participant {
  _id: string;
  name: string;
  avatar?: string;
}

export function useMentions(
  isGroup: boolean,
  participants: Participant[] | undefined,
  currentUserId: string | undefined
) {
  // Dónde está el cursor y qué se lleva escrito tras la @ (null = no hay mención
  // en curso).
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState<{ query: string; start: number } | null>(null);

  /** TODOS los miembros, incluido yo. Para RESALTAR las menciones al pintar. */
  const all = useMemo<MentionUser[]>(
    () =>
      isGroup
        ? (participants ?? []).map((p) => ({ _id: p._id, name: p.name, avatar: p.avatar }))
        : [],
    [isGroup, participants]
  );

  /** Los miembros menos yo. A quién puedo mencionar AL ESCRIBIR. */
  const mentionable = useMemo<MentionUser[]>(
    () => all.filter((u) => u._id !== currentUserId),
    [all, currentUserId]
  );

  /** Los que encajan con lo escrito ahora mismo (vacío si no se está mencionando). */
  const candidates = useMemo(
    () => (query ? filterMentionCandidates(mentionable, query.query) : []),
    [query, mentionable]
  );

  /**
   * Recalcula si hay una mención en curso. Se llama al teclear y al mover el
   * cursor: al teclear basta con el final del texto, pero si el usuario pincha en
   * medio de lo escrito hay que mirar desde ahí.
   */
  const update = (text: string, pos: number) => {
    setCursor(pos);
    setQuery(isGroup ? activeMentionQuery(text, pos) : null);
  };

  /**
   * Mete la mención elegida en el texto. Devuelve el texto nuevo y dónde dejar el
   * cursor — quien llama decide cómo aplicarlo (el input es suyo).
   */
  const pick = (text: string, user: MentionUser) => {
    if (!query) return null;
    const next = applyMention(text, query.start, cursor, user);
    setQuery(null);
    return next;
  };

  const close = () => setQuery(null);

  /**
   * A quién se menciona en el texto FINAL, al enviar.
   *
   * Se recalcula en vez de ir apuntando los elegidos: el usuario pudo borrar el
   * "@Pedro" después de escribirlo, y avisar a Pedro de un mensaje donde ya no
   * aparece sería desconcertante.
   */
  const resolve = (text: string) => (isGroup ? resolveMentions(text, mentionable) : []);

  return { query, candidates, all, mentionable, update, pick, close, resolve };
}

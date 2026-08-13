import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cld } from '../../lib/cldImage';

// Burbuja de una encuesta — misma composición que WhatsApp.
//
// Nace de lo que los grupos ya hacen a mano: coordinar ayunos, vigilias y escalas
// de oración contando mensajes ("¿quién puede el jueves de 6 a 7?"). Con la
// encuesta esa conversación se convierte en una lista.
//
// Los resultados se ven SIEMPRE, sin tener que votar primero: en un grupo de
// oración lo que importa es cuadrar los turnos, no la intriga. Cada opción lleva
// las caras de quienes la votaron, su recuento y una barra a lo ancho.
//
// Espejo de la web: holy_app/frontend/src/components/chat/messages/PollBubble.jsx.

export interface PollVoteStamp {
  user: string;
  at: string;
}

export interface PollOption {
  text: string;
  votes: string[];
  /** Hora del voto de cada uno. Las encuestas viejas no lo traen. */
  votedAt?: PollVoteStamp[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  multiple: boolean;
  closed: boolean;
}

export interface PollUser {
  name: string;
  avatar?: string;
}

interface Props {
  poll: PollData;
  currentUserId: string;
  colors: any;
  textColor: string;
  subtextColor: string;
  onVote: (optionIndex: number) => void;
  /** Para pintar las caras de los votantes: id → nombre y avatar. */
  users?: Map<string, PollUser>;
  /** Fondo de la burbuja — el aro entre caras apiladas. */
  bubbleBg?: string;
  /** Abre "Detalles de la encuesta" (quién votó qué). */
  onSeeVotes?: () => void;
  /** La hora del mensaje. Va DENTRO, encima de la línea de "Ver votos" (como
   *  WhatsApp): si la pintara la burbuja después, quedaría debajo del pie. */
  timestamp?: ReactNode;
  /** Solo el autor de la encuesta (o un admin del grupo) puede cerrarla. */
  canClose?: boolean;
  onClose?: () => void;
}

/** Caras apiladas de quienes votaron una opción, como WhatsApp. */
function VoterFaces({
  ids,
  users,
  colors,
  ringColor,
}: {
  ids: string[];
  users?: Map<string, PollUser>;
  colors: any;
  // El aro que separa una cara de la siguiente va del color de la BURBUJA, no
  // del fondo de la pantalla: sobre la burbuja propia (verde en claro) un aro
  // gris se vería como un cerco sucio.
  ringColor: string;
}) {
  if (!ids.length) return null;
  // Tres caras y para: a partir de ahí manda el número, y apilar más solo
  // estrecha el texto de la opción.
  const shown = ids.slice(0, 3);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((id, i) => {
        const u = users?.get(id);
        return (
          <View
            key={id}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              marginLeft: i === 0 ? 0 : -8,
              borderWidth: 1.5,
              borderColor: ringColor,
              backgroundColor: colors.avatarBg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {u?.avatar ? (
              <Image source={{ uri: cld(u.avatar, 22) }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>
                {(u?.name?.[0] ?? '?').toUpperCase()}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function PollBubble({
  poll,
  currentUserId,
  colors,
  textColor,
  subtextColor,
  onVote,
  users,
  bubbleBg,
  onSeeVotes,
  timestamp,
  canClose,
  onClose,
}: Props) {
  // Total de VOTOS, no de votantes: en una encuesta de respuesta múltiple una
  // persona puede marcar tres opciones, y las barras van sobre los votos emitidos.
  const totalVotes = poll.options.reduce((n, o) => n + (o.votes?.length ?? 0), 0);
  const maxVotes = poll.options.reduce((n, o) => Math.max(n, o.votes?.length ?? 0), 0);

  return (
    <View style={{ minWidth: 250 }}>
      <Text style={{ color: textColor, fontSize: 17, fontWeight: '700', lineHeight: 22 }}>
        {poll.question}
      </Text>

      {/* Qué se puede marcar. Va debajo del título, en gris, como WhatsApp: es
          una instrucción, no una etiqueta de "esto es una encuesta". */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12 }}>
        <Ionicons name={poll.multiple ? 'checkmark-done' : 'checkmark'} size={15} color={subtextColor} />
        <Text style={{ color: subtextColor, fontSize: 13 }}>
          {poll.closed
            ? 'Votación cerrada'
            : poll.multiple
            ? 'Selecciona una opción o más.'
            : 'Selecciona una opción.'}
        </Text>
      </View>

      {poll.options.map((opt, i) => {
        const voterIds = opt.votes ?? [];
        const votes = voterIds.length;
        const voted = voterIds.some((v) => String(v) === currentUserId);
        // La barra se mide contra la opción MÁS votada, no contra el total: así
        // la ganadora siempre llena la barra y la comparación entre opciones se
        // lee de un vistazo (es lo que hace WhatsApp).
        const pct = maxVotes ? Math.round((votes / maxVotes) * 100) : 0;

        return (
          <TouchableOpacity
            key={i}
            onPress={() => !poll.closed && onVote(i)}
            disabled={poll.closed}
            activeOpacity={0.7}
            style={{ marginBottom: 14 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Marca de "yo voté esto": redonda en respuesta única, cuadrada en
                  múltiple — la forma dice cuántas se pueden marcar sin leer nada. */}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: poll.multiple ? 7 : 13,
                  borderWidth: 2,
                  borderColor: voted ? colors.accent : subtextColor,
                  backgroundColor: voted ? colors.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {voted && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>

              <Text style={{ color: textColor, fontSize: 16, flex: 1 }} numberOfLines={3}>
                {opt.text}
              </Text>

              <VoterFaces
                ids={voterIds}
                users={users}
                colors={colors}
                ringColor={bubbleBg ?? colors.bgSecondary}
              />
              <Text style={{ color: textColor, fontSize: 15, fontWeight: '600', minWidth: 14, textAlign: 'right' }}>
                {votes}
              </Text>
            </View>

            {/* Barra de resultados: a lo ancho de la burbuja, bajo la fila. */}
            <View
              style={{
                height: 7,
                borderRadius: 4,
                backgroundColor: subtextColor + '33',
                overflow: 'hidden',
                marginTop: 7,
                marginLeft: 38,
              }}
            >
              <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: colors.accent }} />
            </View>
          </TouchableOpacity>
        );
      })}

      {!!timestamp && <View style={{ alignSelf: 'flex-end', marginBottom: 4 }}>{timestamp}</View>}

      {/* Pie: "Ver votos" separado por una línea, como WhatsApp. Cerrar la
          votación solo lo ve quien la creó (o un admin del grupo): cerrar la
          encuesta de otro sería quitarle la palabra. */}
      <View style={{ height: 1, backgroundColor: subtextColor + '33', marginTop: 2, marginBottom: 2 }} />

      <TouchableOpacity onPress={onSeeVotes} style={{ paddingVertical: 10, alignItems: 'center' }}>
        <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>
          {totalVotes === 0 ? 'Sé el primero en votar' : 'Ver votos'}
        </Text>
      </TouchableOpacity>

      {canClose && !poll.closed && (
        <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingBottom: 4 }}>
          <Text style={{ color: subtextColor, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
            Cerrar votación
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

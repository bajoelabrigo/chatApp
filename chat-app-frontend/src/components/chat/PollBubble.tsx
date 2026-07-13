import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Burbuja de una encuesta.
//
// Nace de lo que los grupos ya hacen a mano: coordinar ayunos, vigilias y escalas
// de oración contando mensajes ("¿quién puede el jueves de 6 a 7?"). Con la
// encuesta esa conversación se convierte en una lista.
//
// Los resultados se ven SIEMPRE, sin tener que votar primero: en un grupo de
// oración lo que importa es cuadrar los turnos, no la intriga. Cada opción es una
// barra con su porcentaje y su número de votos.

export interface PollOption {
  text: string;
  votes: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  multiple: boolean;
  closed: boolean;
}

interface Props {
  poll: PollData;
  currentUserId: string;
  colors: any;
  textColor: string;
  subtextColor: string;
  onVote: (optionIndex: number) => void;
  /** Solo el autor de la encuesta (o un admin del grupo) puede cerrarla. */
  canClose?: boolean;
  onClose?: () => void;
}

export function PollBubble({
  poll,
  currentUserId,
  colors,
  textColor,
  subtextColor,
  onVote,
  canClose,
  onClose,
}: Props) {
  // Total de VOTOS, no de votantes: en una encuesta de respuesta múltiple una
  // persona puede marcar tres opciones, y los porcentajes deben sumar sobre los
  // votos emitidos.
  const totalVotes = poll.options.reduce((n, o) => n + (o.votes?.length ?? 0), 0);

  return (
    <View style={{ minWidth: 220 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Ionicons name="stats-chart" size={13} color={subtextColor} />
        <Text style={{ color: subtextColor, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Encuesta{poll.multiple ? ' · varias respuestas' : ''}
          {poll.closed ? ' · cerrada' : ''}
        </Text>
      </View>

      <Text style={{ color: textColor, fontSize: 16, fontWeight: '600', marginBottom: 10 }}>
        {poll.question}
      </Text>

      {poll.options.map((opt, i) => {
        const votes = opt.votes?.length ?? 0;
        const voted = (opt.votes ?? []).some((v) => String(v) === currentUserId);
        const pct = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;

        return (
          <TouchableOpacity
            key={i}
            onPress={() => !poll.closed && onVote(i)}
            disabled={poll.closed}
            activeOpacity={0.7}
            style={{ marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              {/* Marca de "yo voté esto": redonda en respuesta única, cuadrada en
                  múltiple — la forma dice cuántas se pueden marcar sin leer nada. */}
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: poll.multiple ? 4 : 9,
                  borderWidth: 2,
                  borderColor: voted ? colors.accent : subtextColor,
                  backgroundColor: voted ? colors.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {voted && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>

              <Text style={{ color: textColor, fontSize: 14, flex: 1 }} numberOfLines={2}>
                {opt.text}
              </Text>
              <Text style={{ color: subtextColor, fontSize: 12, fontWeight: '600' }}>{votes}</Text>
            </View>

            {/* Barra de resultados */}
            <View
              style={{
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.bgTertiary,
                overflow: 'hidden',
                marginLeft: 26,
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 3,
                  backgroundColor: voted ? colors.accent : subtextColor,
                }}
              />
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <Text style={{ color: subtextColor, fontSize: 11, flex: 1 }}>
          {totalVotes === 0
            ? 'Sé el primero en votar'
            : `${totalVotes} voto${totalVotes === 1 ? '' : 's'}`}
        </Text>

        {/* Cerrar la votación. Solo lo ve quien creó la encuesta (o un admin del
            grupo): cerrar la encuesta de otro sería quitarle la palabra. Sin esto,
            el autor cuadraba los turnos y la gente seguía votando y moviéndoselos. */}
        {canClose && !poll.closed && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: subtextColor, fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' }}>
              Cerrar votación
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

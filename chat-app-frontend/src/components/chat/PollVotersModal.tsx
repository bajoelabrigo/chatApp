import { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { cld } from '../../lib/cldImage';
import type { PollData, PollUser } from './PollBubble';

// "Votos de la encuesta" — quién votó qué, a pantalla completa y por tarjetas,
// como WhatsApp: una tarjeta con la pregunta y otra por opción (recuento a la
// derecha, ⭐ en la más votada y la lista de votantes con su hora).
//
// Se pinta con el mensaje VIVO del store, así que los votos que llegan por
// `poll:update` mientras está abierto se ven al momento, sin cerrar y volver.
//
// Espejo de la web: holy_app/frontend/src/components/chat/messages/PollVotersModal.jsx.

// Cuántos votantes se enseñan antes de "Ver todos". Con más, la opción ganadora
// se comería la pantalla y las demás quedarían fuera de vista.
const PREVIEW = 5;

interface Props {
  visible: boolean;
  poll?: PollData | null;
  /** id → nombre y avatar de los participantes del chat. */
  users: Map<string, PollUser>;
  currentUserId: string;
  onClose: () => void;
}

/** "hoy" / "ayer" / "3 ago" + la hora, separados: el día va más apagado. */
function whenParts(iso?: string): { day: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86400000);
  if (d.toDateString() === hoy.toDateString()) return { day: 'hoy', time };
  if (d.toDateString() === ayer.toDateString()) return { day: 'ayer', time };
  return { day: d.toLocaleDateString([], { day: 'numeric', month: 'short' }), time };
}

export function PollVotersModal({ visible, poll, users, currentUserId, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Qué opciones enseñan la lista entera (tras pulsar "Ver todos").
  const [expandidas, setExpandidas] = useState<Record<number, boolean>>({});

  const options = poll?.options ?? [];
  const maxVotes = options.reduce((n, o) => Math.max(n, o.votes?.length ?? 0), 0);

  // De más votada a menos: es el orden en el que se lee un resultado. El empate
  // conserva el orden original de la encuesta.
  const ordenadas = options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (b.o.votes?.length ?? 0) - (a.o.votes?.length ?? 0));

  const card = {
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: insets.top }}>
        {/* Cabecera: la X en un botón redondo a la izquierda y el título centrado. */}
        <View style={{ height: 60, justifyContent: 'center' }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 17,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            Votos de la encuesta
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              position: 'absolute',
              left: 14,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.bgSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: insets.bottom + 32, gap: 16 }}
        >
          <View style={card}>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', lineHeight: 26 }}>
              {poll?.question}
            </Text>
            {poll?.closed && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }}>
                Votación cerrada.
              </Text>
            )}
          </View>

          {ordenadas.map(({ o, i }) => {
            const ids = (o.votes ?? []).map(String);
            // Con `set` gana el último sello: si un doble toque dejó dos, se pinta
            // la hora del voto que cuenta.
            const sellos = new Map<string, string>();
            (o.votedAt ?? []).forEach((s: any) => {
              if (s?.user) sellos.set(String(s.user), s.at);
            });
            const esGanadora = maxVotes > 0 && ids.length === maxVotes;
            const todos = !!expandidas[i];
            const visibles = todos ? ids : ids.slice(0, PREVIEW);

            return (
              <View key={i} style={card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '700', flex: 1 }}>
                    {o.text}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                    {ids.length} {ids.length === 1 ? 'voto' : 'votos'}
                  </Text>
                  {esGanadora && <Ionicons name="star" size={16} color={colors.textSecondary} />}
                </View>

                {visibles.map((uid, n) => {
                  const u = users.get(uid);
                  const nombre = uid === currentUserId ? 'Tú' : u?.name ?? 'Miembro';
                  const cuando = whenParts(sellos.get(uid));
                  return (
                    <View
                      key={uid}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 10,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        marginTop: n === 0 ? 12 : 0,
                      }}
                    >
                      {u?.avatar ? (
                        <Image
                          source={{ uri: cld(u.avatar, 40) }}
                          style={{ width: 40, height: 40, borderRadius: 20 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.avatarBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>
                            {nombre[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                      )}

                      <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }} numberOfLines={1}>
                        {nombre}
                      </Text>

                      {!!cuando && (
                        <Text style={{ fontSize: 13, color: colors.textPrimary }}>
                          <Text style={{ color: colors.textSecondary }}>{cuando.day} </Text>
                          {cuando.time}
                        </Text>
                      )}
                    </View>
                  );
                })}

                {ids.length > PREVIEW && !todos && (
                  <TouchableOpacity
                    onPress={() => setExpandidas((prev) => ({ ...prev, [i]: true }))}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Ver todos</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

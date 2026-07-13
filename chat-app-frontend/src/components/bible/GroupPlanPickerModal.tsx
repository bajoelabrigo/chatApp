import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Elegir con qué grupo leer un plan.
//
// Leer un plan "con el grupo" no cambia el plan: cada miembro conserva su
// progreso y su recordatorio. Lo que se comparte es la FECHA DE INICIO, y por eso
// todos van por el mismo día — quien se une tarde se alinea con el grupo en vez
// de empezar por el día 1. Eso es lo que hace que "hoy toca Juan 5" signifique lo
// mismo para todos, que es el sentido de leer juntos.

interface Props {
  planTitle: string;
  groups: any[];
  colors: any;
  bottomInset: number;
  onClose: () => void;
  onPick: (groupId: string | null) => void; // null = leerlo por mi cuenta
}

export function GroupPlanPickerModal({
  planTitle,
  groups,
  colors,
  bottomInset,
  onClose,
  onPick,
}: Props) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 24 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
              ¿Con quién lo lees?
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
              {planTitle}
            </Text>

            {/* Por mi cuenta: el plan de siempre. */}
            <TouchableOpacity
              onPress={() => onPick(null)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginTop: 18,
                padding: 14,
                borderRadius: 14,
                backgroundColor: colors.bgTertiary,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                  Por mi cuenta
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  Empiezas hoy, a tu ritmo
                </Text>
              </View>
            </TouchableOpacity>

            {groups.length > 0 && (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginTop: 22,
                  marginBottom: 4,
                }}
              >
                Con un grupo
              </Text>
            )}

            {groups.map((g) => (
              <TouchableOpacity
                key={g._id}
                onPress={() => onPick(g._id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 10,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: colors.bgTertiary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="people" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
                    {g.groupName ?? 'Grupo'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Verás el avance de todos · se avisará al grupo
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            {groups.length === 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 18, textAlign: 'center' }}>
                No estás en ningún grupo todavía. Únete a uno para leer acompañado.
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

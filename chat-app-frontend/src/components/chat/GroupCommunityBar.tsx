import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';

// Franja bajo la cabecera del chat de un grupo: lo que hay abierto ahora mismo.
//
// Las actividades y las peticiones de oración viven en pantallas aparte, y la
// única puerta desde el chat eran dos iconos redondos de 34px, sin etiqueta ni
// número. Quien no supiera lo que eran, no los tocaba — y la gente pasa el tiempo
// en el CHAT, no en esas pantallas. Si algo no aparece donde está la gente, para
// la gente no existe.
//
// Dos tonos según el caso, y esto es lo importante:
//  · No participas todavía → INVITA ("Únete", en color de acento).
//  · Ya participas → solo INFORMA, discreta. Insistirle a quien ya está dentro es
//    ruido, y el ruido acaba en que se ignora la franja entera.
//
// Sin nada abierto no se pinta: una franja que dice "0 actividades" solo estorba.

export interface GroupPlanChip {
  title: string;
  currentDay: number;
  totalDays: number;
  memberCount: number;
  readToday: number;
  iJoined: boolean;
  isTodayDone: boolean;
}

interface Props {
  activities: number;
  prayers: number;
  /** El plan de lectura que lee el grupo (null si no hay ninguno). */
  plan: GroupPlanChip | null;
  iParticipate: boolean;
  colors: any;
  onOpenActivities: () => void;
  onOpenPrayers: () => void;
  onOpenPlan: () => void;
}

export function GroupCommunityBar({
  activities,
  prayers,
  plan,
  iParticipate,
  colors,
  onOpenActivities,
  onOpenPrayers,
  onOpenPlan,
}: Props) {
  if (activities === 0 && prayers === 0 && !plan) return null;

  const invite = !iParticipate;

  const chip = (
    icon: React.ReactNode,
    label: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: invite ? 'rgba(255,255,255,0.18)' : colors.bgTertiary,
      }}
    >
      {icon}
      <Text
        style={{
          color: invite ? '#fff' : colors.textSecondary,
          fontSize: 12,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const iconColor = invite ? '#fff' : colors.textSecondary;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: invite ? colors.accent : colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {invite && (
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginRight: 2 }}>
          Únete:
        </Text>
      )}

      {activities > 0 &&
        chip(
          <Ionicons name="flame" size={13} color={iconColor} />,
          `${activities} actividad${activities === 1 ? '' : 'es'}`,
          onOpenActivities
        )}

      {prayers > 0 &&
        chip(
          <FontAwesome5 name="praying-hands" size={12} color={iconColor} />,
          `${prayers} petici${prayers === 1 ? 'ón' : 'ones'}`,
          onOpenPrayers
        )}

      {/* Plan de lectura del grupo. Lo que engancha no es el título del plan, es
          ver que 3 de 5 ya leyeron hoy — así que eso es lo que se muestra. A quien
          ya lee con el grupo se le recuerda si le falta lo de hoy. */}
      {plan &&
        chip(
          <Ionicons name="book" size={13} color={iconColor} />,
          plan.iJoined
            ? plan.isTodayDone
              ? `Día ${plan.currentDay} leído`
              : `Te falta el día ${plan.currentDay}`
            : `${plan.readToday} de ${plan.memberCount} leyeron hoy`,
          onOpenPlan
        )}
    </View>
  );
}

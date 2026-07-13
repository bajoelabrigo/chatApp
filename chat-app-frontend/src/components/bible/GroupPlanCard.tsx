import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PhotoCard, photoCardChip } from './PhotoCard';

// "Lee con tu grupo" — la puerta de entrada a los planes de lectura en grupo.
//
// Antes esto solo se descubría entrando al menú de los tres puntos → Planes →
// Empezar, y ahí nadie lo encontraba. La tarjeta tiene DOS caras:
//
//  · Si ya lees un plan con un grupo → cuánto llevas y cuántos del grupo van al
//    día (que es justo lo que empuja a no abandonar).
//  · Si estás en algún grupo pero no lees ninguno → invitación a empezar.
//
// Si el usuario no pertenece a ningún grupo NO se pinta nada: invitarle a leer
// con un grupo que no tiene sería una tarjeta muerta.

interface Props {
  photo: string | null;
  /** El plan de grupo activo (con progreso de miembros), o null si no hay. */
  plan: {
    title: string;
    currentDay: number;
    totalDays: number;
    completedCount: number;
    groupName: string;
    members: any[];
  } | null;
  /** Cuántos grupos tiene el usuario (0 = no se pinta la tarjeta). */
  groupCount: number;
  colors: any;
  onOpen: () => void;
}

export function GroupPlanCard({ photo, plan, groupCount, colors, onOpen }: Props) {
  if (!plan && groupCount === 0) return null;

  // ── Ya lee un plan con el grupo ──────────────────────────
  if (plan) {
    const pct = plan.totalDays
      ? Math.round((plan.completedCount / plan.totalDays) * 100)
      : 0;
    // Cuántos del grupo llevan la lectura de hoy hecha. Es el dato social: ver que
    // tres de cinco ya leyeron es lo que te levanta del sofá.
    const alDia = plan.members.filter((m: any) => m.isTodayDone).length;

    return (
      <PhotoCard label={`Leyendo con ${plan.groupName}`} photo={photo} fallback="#065f46">
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 10 }}>
          {plan.title}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>
          Día {plan.currentDay} de {plan.totalDays} · {alDia} de {plan.members.length}{' '}
          {plan.members.length === 1 ? 'ya leyó' : 'ya leyeron'} hoy
        </Text>

        {/* Tu avance */}
        <View
          style={{
            height: 6,
            backgroundColor: 'rgba(255,255,255,0.25)',
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: 12,
          }}
        >
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: '#fff', borderRadius: 3 }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <TouchableOpacity onPress={onOpen} style={photoCardChip}>
            <Ionicons name="people" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Ver el grupo</Text>
          </TouchableOpacity>
        </View>
      </PhotoCard>
    );
  }

  // ── Está en grupos, pero no lee ninguno con ellos ────────
  return (
    <PhotoCard label="Lee con tu grupo" photo={photo} fallback="#065f46">
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 10 }}>
        Un plan de lectura, juntos
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 19, marginTop: 4 }}>
        Elige un plan y léelo con tu grupo: veréis el avance de cada uno y nadie se
        queda atrás.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
        <TouchableOpacity onPress={onOpen} style={photoCardChip}>
          <Ionicons name="people" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Elegir un plan</Text>
        </TouchableOpacity>
      </View>
    </PhotoCard>
  );
}

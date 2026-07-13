import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Planes de lectura (#2): los del usuario (con progreso y lectura de hoy) y el
// catálogo de los que puede empezar. La lógica (suscribirse, marcar el día,
// recordatorios) vive en la pantalla; aquí solo se pinta y se avisa.
interface Props {
  loading: boolean;
  myPlans: any[];
  catalog: any[];
  busyKey: string | null;
  colors: any;
  bottomInset: number;
  // Planes que se leen en grupo: planKey → { groupName, members }. Lo que hace
  // que un plan de grupo se note es VER a los demás; sin esto sería un plan
  // normal con una etiqueta.
  groupProgress: Record<string, { groupName: string; members: any[] }>;
  onOpenPassage: (bookIndex: number, chapter: number) => void;
  onToggleDay: (plan: any) => void;
  onReminder: (plan: any) => void;
  onRestart: (plan: any) => void;
  onAbandon: (planKey: string) => void;
  onStart: (planKey: string) => void;
  onCreate: () => void;
}

export function ReadingPlansView({
  loading,
  myPlans,
  catalog,
  busyKey,
  colors,
  bottomInset,
  groupProgress,
  onOpenPassage,
  onToggleDay,
  onReminder,
  onRestart,
  onAbandon,
  onStart,
  onCreate,
}: Props) {
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const sectionTitle = {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
  };

  const card = {
    margin: 16,
    marginBottom: 0,
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const subscribedKeys = new Set(myPlans.map((p) => p.planKey));
  const available = catalog.filter((p) => !subscribedKeys.has(p.key));

  const renderPlan = (plan: any) => {
    const pct = plan.totalDays ? Math.round((plan.completedCount / plan.totalDays) * 100) : 0;
    const group = plan.groupId ? groupProgress[plan.planKey] : undefined;

    return (
      <View key={plan.planKey} style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{plan.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Día {plan.currentDay} de {plan.totalDays} · {plan.completedCount} leídos
            </Text>
            {group && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Ionicons name="people" size={12} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                  {group.groupName}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => onReminder(plan)} style={{ padding: 4 }}>
            <Ionicons
              name={plan.reminderEnabled ? 'notifications' : 'notifications-off-outline'}
              size={20}
              color={plan.reminderEnabled ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Barra de progreso */}
        <View style={{ height: 6, backgroundColor: colors.bgTertiary, borderRadius: 3, overflow: 'hidden', marginTop: 12 }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
        </View>

        {plan.isFinished ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#22c55e', fontWeight: '600', marginBottom: 10 }}>¡Plan completado! 🎉</Text>
            <TouchableOpacity
              onPress={() => onRestart(plan)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.accent }}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Volver a empezar</Text>
            </TouchableOpacity>
          </View>
        ) : plan.today ? (
          <View style={{ marginTop: 12, backgroundColor: colors.bgTertiary, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Hoy · Día {plan.today.day}
            </Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15, marginTop: 3 }}>
              {plan.today.label}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  const r = plan.today.references?.[0];
                  if (r) onOpenPassage(r.book, r.startChapter);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.accent }}
              >
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Leer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onToggleDay(plan)}
                disabled={busyKey === plan.planKey}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                  borderWidth: 1, borderColor: plan.isTodayDone ? '#22c55e' : colors.border,
                  backgroundColor: plan.isTodayDone ? '#22c55e22' : 'transparent',
                }}
              >
                <Ionicons name="checkmark" size={14} color={plan.isTodayDone ? '#22c55e' : colors.textSecondary} />
                <Text style={{ color: plan.isTodayDone ? '#22c55e' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {plan.isTodayDone ? 'Leído' : 'Marcar leído'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* El grupo: quién va por dónde. Es lo que hace que nadie abandone en
            silencio — y lo que diferencia esto de un plan cualquiera. */}
        {group && group.members.length > 0 && (
          <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              El grupo va por aquí
            </Text>

            {group.members.map((m: any) => {
              const mpct = plan.totalDays
                ? Math.round((m.completedCount / plan.totalDays) * 100)
                : 0;
              return (
                <View
                  key={m.userId}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}
                  >
                    {m.name}
                  </Text>
                  <View
                    style={{
                      flex: 1,
                      height: 5,
                      backgroundColor: colors.bgTertiary,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        width: `${mpct}%`,
                        backgroundColor: m.isTodayDone ? '#22c55e' : colors.accent,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, width: 52, textAlign: 'right' }}>
                    {m.completedCount}/{plan.totalDays}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
          <TouchableOpacity onPress={() => onRestart(plan)}>
            <Text style={{ color: colors.accent, fontSize: 12 }}>Volver a empezar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAbandon(plan.planKey)}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>Abandonar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCatalogPlan = (plan: any) => (
    <View
      key={plan.key}
      style={{
        ...card,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>{plan.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{plan.description}</Text>
        <Text style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>
          {plan.totalDays} días · {plan.category}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onStart(plan.key)}
        disabled={busyKey === plan.key}
        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.accent }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Empezar</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 24 }}>
      {myPlans.length > 0 && (
        <Text style={{ ...sectionTitle, paddingTop: 16 }}>Mis planes</Text>
      )}
      {myPlans.map(renderPlan)}

      {/* Crear mi plan (#D) */}
      <TouchableOpacity
        onPress={onCreate}
        style={{
          marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 14,
          borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>Crear mi plan</Text>
      </TouchableOpacity>

      {available.length > 0 && (
        <Text style={{ ...sectionTitle, paddingTop: 24 }}>
          {myPlans.length > 0 ? 'Otros planes' : 'Empieza un plan de lectura'}
        </Text>
      )}
      {available.map(renderCatalogPlan)}
    </ScrollView>
  );
}

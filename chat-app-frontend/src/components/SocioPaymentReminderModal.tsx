import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../context/ThemeContext';
import { getSocioReminder } from '../services/socioService';

// Aviso de pago para socios manuales. El backend (cron de la web) enciende el
// flag `socioPaymentReminder` en los últimos 3 días antes del pago (o si venció)
// en la base compartida. Se muestra al arrancar la sesión hasta que el admin
// registra el pago (el flag solo se apaga desde el panel). Se cierra por sesión
// con estado local para no ser pesado.
export function SocioPaymentReminderModal() {
  const { token, isSignedIn, user } = useAuthStore();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [amount, setAmount] = useState(0);
  const [nextDate, setNextDate] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !token) return;
    let active = true;
    // Pequeño respiro para no competir con el arranque (socket, push, etc.).
    const t = setTimeout(() => {
      getSocioReminder(token)
        .then((r) => {
          if (active && r.pending) {
            setOverdue(!!r.overdue);
            setAmount(r.amount || 0);
            setNextDate(r.nextPaymentDate || null);
            setVisible(true);
          }
        })
        .catch(() => {});
    }, 1800);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [isSignedIn, token]);

  const close = () => setVisible(false);

  const goToOfferings = () => {
    close();
    router.push('/(tabs)/ofrendas' as any);
  };

  const firstName = (user?.name || '').split(' ')[0];
  const fecha = nextDate
    ? new Date(nextDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: colors.bgSecondary, borderRadius: 24, overflow: 'hidden' }}>
          {/* Cabecera */}
          <View style={{ backgroundColor: colors.accent, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name={overdue ? 'alert-circle' : 'card'} size={34} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800', textAlign: 'center' }}>
              {overdue ? 'Tu ofrenda está pendiente' : 'Tu fecha de ofrenda está cerca'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4, textAlign: 'center' }}>
              {firstName ? `Gracias, ${firstName}. ` : 'Gracias. '}Tu ofrenda sostiene este sueño. 🙏
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>
              {overdue
                ? 'Tu ofrenda mensual como Socio figura como pendiente. Si ya la realizaste, ¡gracias! La registraremos en cuanto la confirmemos.'
                : 'Se acerca la fecha de tu ofrenda mensual como Socio. Te avisamos con tiempo para que puedas prepararla con calma.'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.bgPrimary, borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <Ionicons name="calendar" size={22} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                {fecha && (
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Fecha de pago: {fecha}</Text>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                  Ofrenda mensual: ${amount}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.bgPrimary, borderRadius: 14, padding: 12 }}>
              <Ionicons name="sync" size={22} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>¿Prefieres pago automático?</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                  Activa tu ofrenda como suscripción y se renovará sola cada mes, sin recordatorios.
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 20, paddingTop: 8, gap: 10 }}>
            <TouchableOpacity onPress={goToOfferings} style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="heart" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ver opciones de ofrenda</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

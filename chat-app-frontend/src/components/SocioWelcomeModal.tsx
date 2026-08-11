import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../context/ThemeContext';
import { getSocioWelcome, markSocioWelcomeSeen } from '../services/socioService';

// Modal de bienvenida socio: se muestra UNA vez cuando el usuario se hace socio
// (por suscripción o por un admin). Consulta el estado al arrancar la sesión.
export function SocioWelcomeModal() {
  const { token, isSignedIn, user } = useAuthStore();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [fullAccess, setFullAccess] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !token) return;
    let active = true;
    // Pequeño respiro para no competir con el arranque (socket, push, etc.).
    const t = setTimeout(() => {
      getSocioWelcome(token)
        .then((r) => {
          if (active && r.pending) {
            setName(r.name || user?.name || '');
            setFullAccess(r.fullAccess !== false);
            setVisible(true);
          }
        })
        .catch(() => {});
    }, 1500);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [isSignedIn, token]);

  const close = () => {
    setVisible(false);
    if (token) markSocioWelcomeSeen(token).catch(() => {});
  };

  const goToMaterials = () => {
    close();
    // Con acceso completo, a los materiales; si no, a ofrendas para mejorar.
    router.push((fullAccess ? '/menu/materiales' : '/(tabs)/ofrendas') as any);
  };

  const firstName = (name || '').split(' ')[0];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: colors.bgSecondary, borderRadius: 24, overflow: 'hidden' }}>
          {/* Cabecera */}
          <View style={{ backgroundColor: colors.accent, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="shield-checkmark" size={34} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>¡Ahora eres Socio!</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4, textAlign: 'center' }}>
              {firstName ? `Gracias, ${firstName}. ` : 'Gracias. '}Tu ofrenda sostiene este sueño. 🙏
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>
              Tu ofrenda no es un pago, es una siembra: con ella ayudas a sostener el sueño de HolyHolyHoly y a que esta comunidad siga al alcance de todos.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.bgPrimary, borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <Ionicons name="shield-checkmark" size={22} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Tu insignia de Socio</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                  Un escudo aparecerá junto a tu nombre en la comunidad: publicaciones, comentarios, perfil y el chat.
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.bgPrimary, borderRadius: 14, padding: 12 }}>
              <Ionicons name="library" size={22} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                {fullAccess ? (
                  <>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>+100 estudios, gratis</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                      Acceso libre a más de 100 estudios de alta calidad. Descárgalos todos sin costo.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Desbloquea +100 estudios</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                      Con una ofrenda mensual de $20 o más accedes gratis a más de 100 estudios para descargar.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 20, paddingTop: 8, gap: 10 }}>
            <TouchableOpacity onPress={goToMaterials} style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name={fullAccess ? 'library' : 'heart'} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {fullAccess ? 'Ver los estudios' : 'Mejorar mi ofrenda'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Seguir explorando</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

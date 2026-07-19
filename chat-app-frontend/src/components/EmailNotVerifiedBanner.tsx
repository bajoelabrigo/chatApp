import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/useAuthStore';
import { resendCodeApi } from '../services/authService';
import { router } from 'expo-router';

// Aviso de correo sin verificar dentro de la app.
//
// Hasta 2026-07-18 el login respondía 403 y no se podía entrar sin verificar,
// mientras que en la web el mismo usuario entraba sin problema: quien se
// registraba por la web e ignoraba el correo quedaba fuera de la app para
// siempre, sin explicación. Ahora entra y ve esto.
//
// Solo se muestra si `emailVerified` es exactamente false: las sesiones
// guardadas por versiones anteriores no traen el campo, y ante la duda es
// preferible no dar la lata a quien sí está verificado.
export function EmailNotVerifiedBanner() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [sending, setSending] = useState(false);

  if (user?.emailVerified !== false) return null;

  const resend = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      await resendCodeApi(user.email);
      // Se lleva a la pantalla de código, que es donde termina el trámite: sin
      // esto el usuario recibe el correo y no sabe dónde meter los 6 dígitos.
      router.push({
        pathname: '/(auth)/verify' as any,
        params: { email: user.email, mode: 'verify' },
      });
    } catch {
      Alert.alert('No se pudo enviar', 'Inténtalo de nuevo en unos minutos.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: '#F59E0B',
      }}
    >
      <Ionicons name="mail-unread-outline" size={22} color="#F59E0B" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>
          Verifica tu correo
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          Tu cuenta funciona con normalidad. Confírmalo para asegurarte de que
          puedes recuperarla si olvidas la contraseña.
        </Text>
      </View>
      <TouchableOpacity
        onPress={resend}
        disabled={sending}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: colors.accent,
          opacity: sending ? 0.6 : 1,
        }}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Verificar</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

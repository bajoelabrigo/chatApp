import { useState } from 'react';
import { Alert, Text, View, TouchableOpacity, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { GoogleButton } from '../../src/components/ui/GoogleButton';
import { getGoogleIdToken, isErrorWithCode, statusCodes } from '../../src/services/googleSignIn';
import { googleSignInApi } from '../../src/services/authService';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/context/ThemeContext';

export default function WelcomeScreen() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const { isDark, colors } = useTheme();

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      const { token, refreshToken, user } = await googleSignInApi(idToken);
      await setAuth(token, refreshToken, user);
      router.replace('/(tabs)/chats');
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (error.code === statusCodes.IN_PROGRESS) return;
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert('Error', 'Google Play Services no disponible.');
          return;
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bgPrimary}
      />

      {/* Hero */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Decorative circles */}
        <View style={{
          position: 'absolute', top: -60, right: -60,
          width: 220, height: 220, borderRadius: 110,
          backgroundColor: colors.accent, opacity: 0.08,
        }} />
        <View style={{
          position: 'absolute', bottom: 40, left: -40,
          width: 160, height: 160, borderRadius: 80,
          backgroundColor: colors.accent, opacity: 0.06,
        }} />

        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 120, height: 120, marginBottom: 28 }}
          resizeMode="contain"
        />

        <Text style={{ color: colors.textPrimary, fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>
          HolyChat
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
          Mensajería segura para tu comunidad de fe
        </Text>

        {/* Feature pills */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
          {['💬 Mensajes', '📞 Llamadas', '🙏 Oración'].map((label) => (
            <View
              key={label}
              style={{
                paddingHorizontal: 14, paddingVertical: 8,
                backgroundColor: isDark ? colors.bgSecondary : colors.bgSecondary,
                borderRadius: 20,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={{ paddingHorizontal: 28, paddingBottom: 16, gap: 12 }}>
        <GoogleButton onPress={handleGoogle} loading={loading} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>o</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/login' as any)}
          style={{
            backgroundColor: colors.accent,
            borderRadius: 16, paddingVertical: 16,
            alignItems: 'center',
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Iniciar sesión con correo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/register' as any)}
          style={{ paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
            ¿No tienes cuenta?{' '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Regístrate</Text>
          </Text>
        </TouchableOpacity>

        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Al continuar aceptas los Términos de Servicio y la Política de Privacidad
        </Text>
      </View>
    </SafeAreaView>
  );
}

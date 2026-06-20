import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { verifyEmailApi, resendCodeApi } from '../../src/services/authService';
import { useAuthStore } from '../../src/store/useAuthStore';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { useTheme } from '../../src/context/ThemeContext';
import axios from 'axios';

const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const { colors, isDark } = useTheme();
  const { email, mode } = useLocalSearchParams<{ email: string; mode?: string }>();
  const { setAuth } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || loading) return;
    setError('');
    setLoading(true);
    try {
      const { token, refreshToken, user } = await verifyEmailApi(email, code);
      await setAuth(token, refreshToken, user);
      router.replace('/(tabs)/chats');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? 'Código incorrecto');
      } else {
        setError('Error de conexión');
      }
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [code, email, loading, setAuth]);

  useEffect(() => {
    if (code.length === 6) handleVerify();
  }, [code, handleVerify]);

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setSuccess('');
    try {
      await resendCodeApi(email);
      setSuccess('Nuevo código enviado a tu correo');
      setCountdown(RESEND_COOLDOWN);
      setCode('');
    } catch {
      setError('No se pudo reenviar el código');
    }
  };

  const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1***$2');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, paddingBottom: 0 }}>
        <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 32 }}>
        {/* Icon */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(34,197,94,0.12)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <Ionicons name="mail" size={40} color={colors.accent} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 }}>Verifica tu correo</Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
            Enviamos un código de 6 dígitos a{'\n'}
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{maskedEmail}</Text>
          </Text>
        </View>

        {/* OTP */}
        <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} />

        {/* Feedback */}
        <View style={{ marginTop: 20, minHeight: 40, alignItems: 'center' }}>
          {loading && <ActivityIndicator color={colors.accent} />}
          {error && !loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text>
            </View>
          ) : null}
          {success && !loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 14 }}>{success}</Text>
            </View>
          ) : null}
        </View>

        {/* Submit (manual) */}
        <TouchableOpacity
          onPress={handleVerify}
          disabled={code.length !== 6 || loading}
          style={{
            marginTop: 24, backgroundColor: code.length === 6 ? colors.accent : colors.bgSecondary,
            borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            opacity: code.length !== 6 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>Verificar</Text>
        </TouchableOpacity>

        {/* Resend */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>¿No llegó el código?</Text>
          <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
            <Text style={{ color: countdown > 0 ? colors.border : colors.accent, fontSize: 14, fontWeight: '700' }}>
              {countdown > 0 ? `Reenviar en ${countdown}s` : 'Reenviar'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          Revisa también tu carpeta de spam
        </Text>
      </View>
    </SafeAreaView>
  );
}

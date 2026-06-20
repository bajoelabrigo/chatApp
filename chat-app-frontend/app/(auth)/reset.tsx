import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resetPasswordApi, resendCodeApi } from '../../src/services/authService';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { useTheme } from '../../src/context/ThemeContext';
import axios from 'axios';

const RESEND_COOLDOWN = 60;

export default function ResetScreen() {
  const { colors, isDark } = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const passwordsMatch = password === confirm;
  const valid = code.length === 6 && password.length >= 6 && passwordsMatch;

  const handleReset = useCallback(async () => {
    if (!valid || loading) return;
    setError('');
    setLoading(true);
    try {
      await resetPasswordApi(email, code, password);
      setDone(true);
      setTimeout(() => router.replace('/(auth)/login' as any), 2000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? 'Error actualizando contraseña');
      } else {
        setError('Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  }, [valid, loading, email, code, password]);

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await resendCodeApi(email);
      setCountdown(RESEND_COOLDOWN);
      setCode('');
    } catch {
      setError('No se pudo reenviar el código');
    }
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 8 }}>¡Contraseña actualizada!</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }}>Redirigiendo al inicio de sesión...</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  const maskedEmail = email?.replace(/(.{2}).+(@.+)/, '$1***$2') ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, paddingBottom: 0 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 6 }}>Nueva contraseña</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginBottom: 28 }}>
              Ingresa el código enviado a{' '}
              <Text style={{ color: colors.textSecondary }}>{maskedEmail}</Text>
            </Text>

            {/* OTP */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>Código de verificación</Text>
            <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, marginBottom: 24 }}>
              <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
                <Text style={{ color: countdown > 0 ? colors.border : colors.accent, fontSize: 13 }}>
                  {countdown > 0 ? `Reenviar en ${countdown}s` : 'Reenviar código'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* New password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Nueva contraseña</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
              marginBottom: 16,
            }}>
              <TextInput
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={colors.inputPlaceholder}
                secureTextEntry={!showPass}
                style={{ flex: 1, color: colors.inputText, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 }}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 14 }}>
                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Confirmar contraseña</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.inputBg, borderRadius: 12,
              borderWidth: 1.5, borderColor: confirm && !passwordsMatch ? colors.danger : colors.border,
              marginBottom: confirm && !passwordsMatch ? 4 : 24,
            }}>
              <TextInput
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setError(''); }}
                placeholder="Repite tu contraseña"
                placeholderTextColor={colors.inputPlaceholder}
                secureTextEntry={!showPass}
                onSubmitEditing={handleReset}
                returnKeyType="done"
                style={{ flex: 1, color: colors.inputText, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 }}
              />
            </View>
            {confirm && !passwordsMatch && (
              <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 16 }}>Las contraseñas no coinciden</Text>
            )}

            {/* Error */}
            {error ? (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, marginBottom: 20, flexDirection: 'row', gap: 8 }}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleReset}
              disabled={!valid || loading}
              style={{
                backgroundColor: valid ? colors.accent : colors.bgSecondary,
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                opacity: !valid ? 0.5 : 1,
              }}
            >
              {loading
                ? <ActivityIndicator color={colors.accentText} />
                : <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>Actualizar contraseña</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

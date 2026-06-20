import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { forgotPasswordApi } from '../../src/services/authService';
import axios from 'axios';
import { useTheme } from '../../src/context/ThemeContext';

export default function ForgotScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const valid = email.includes('@') && email.includes('.');

  const handleSubmit = async () => {
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      const result = await forgotPasswordApi(email.trim());
      setSent(true);
      if (result.sent && result.email) {
        setTimeout(() => {
          router.replace({ pathname: '/(auth)/reset' as any, params: { email: result.email } });
        }, 1800);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? 'Error procesando solicitud');
      } else {
        setError('Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, paddingBottom: 0 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 32 }}>

          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(34,197,94,0.12)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
              <Ionicons name="lock-closed" size={38} color={colors.accent} />
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 }}>
              Olvidé mi contraseña
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
              Ingresa tu correo y te enviaremos{'\n'}un código para restablecer tu contraseña
            </Text>
          </View>

          {!sent ? (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Correo electrónico</Text>
              <TextInput
                value={email}
                onChangeText={(t) => { setEmail(t); setError(''); }}
                placeholder="tucorreo@ejemplo.com"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
                onSubmitEditing={handleSubmit}
                returnKeyType="send"
                style={{
                  backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12,
                  paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
                  borderWidth: 1.5, borderColor: colors.border, marginBottom: 24,
                }}
              />

              {error ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, marginBottom: 20, flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!valid || loading}
                style={{
                  backgroundColor: valid ? colors.accent : colors.bgSecondary,
                  borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                  opacity: !valid ? 0.5 : 1,
                }}
              >
                {loading
                  ? <ActivityIndicator color={colors.accentText} />
                  : <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>Enviar código</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(34,197,94,0.15)',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <Ionicons name="checkmark-circle" size={36} color={colors.accent} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
                ¡Código enviado!
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
                Redirigiendo para ingresar el código...
              </Text>
              <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>¿Recordaste tu contraseña?</Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)}>
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

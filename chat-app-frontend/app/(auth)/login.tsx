import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loginApi } from '../../src/services/authService';
import { useAuthStore } from '../../src/store/useAuthStore';
import axios from 'axios';
import { useTheme } from '../../src/context/ThemeContext';

export default function LoginScreen() {
  const { setAuth } = useAuthStore();
  const { isDark, colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const valid = email.includes('@') && password.length >= 1;

  const handleLogin = async () => {
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      const { token, refreshToken, user } = await loginApi(email.trim(), password);
      await setAuth(token, refreshToken, user);
      router.replace('/(tabs)/chats');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (data?.needsVerification) {
          router.push({ pathname: '/(auth)/verify' as any, params: { email: data.email, mode: 'verify' } });
          return;
        }
        setError(data?.error ?? 'Error iniciando sesión');
      } else {
        setError('Error de conexión. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, paddingBottom: 0 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Bienvenido de nuevo</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginBottom: 36 }}>Ingresa tus datos para continuar</Text>

            {/* Email */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Correo electrónico</Text>
            <TextInput
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              placeholder="tucorreo@ejemplo.com"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{
                backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 14,
                paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
                borderWidth: 1.5, borderColor: colors.border, marginBottom: 20,
              }}
            />

            {/* Password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Contraseña</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.inputBg, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
              marginBottom: 8,
            }}>
              <TextInput
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                placeholder="Tu contraseña"
                placeholderTextColor={colors.inputPlaceholder}
                secureTextEntry={!showPass}
                autoComplete="password"
                style={{ flex: 1, color: colors.inputText, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 }}
                onSubmitEditing={handleLogin}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 14 }}>
                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => router.push('/(auth)/forgot' as any)} style={{ alignSelf: 'flex-end', marginBottom: 28 }}>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {/* Error */}
            {error ? (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, marginBottom: 20, flexDirection: 'row', gap: 8 }}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={!valid || loading}
              style={{
                backgroundColor: valid ? colors.accent : colors.bgTertiary,
                borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                opacity: !valid ? 0.5 : 1,
                shadowColor: valid ? colors.accent : 'transparent',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3, shadowRadius: 12, elevation: valid ? 6 : 0,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Iniciar sesión</Text>
              }
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>¿No tienes cuenta?</Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/register' as any)}>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Regístrate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

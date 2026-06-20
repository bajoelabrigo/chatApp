import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registerApi } from '../../src/services/authService';
import axios from 'axios';
import { useTheme } from '../../src/context/ThemeContext';

const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#3B82F6'];

function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme();
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (!password) return null;
  const labels = ['Muy débil', 'Débil', 'Regular', 'Fuerte'];
  return (
    <View style={{ marginTop: 6, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < score ? STRENGTH_COLORS[score - 1] : colors.border }} />
        ))}
      </View>
      <Text style={{ color: score > 0 ? STRENGTH_COLORS[score - 1] : colors.textMuted, fontSize: 12 }}>{labels[Math.max(0, score - 1)]}</Text>
    </View>
  );
}

export default function RegisterScreen() {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordsMatch = password === confirm;
  const valid = name.trim().length >= 2 && email.includes('@') && password.length >= 6 && passwordsMatch;

  const handleRegister = async () => {
    if (!valid) return;
    if (!passwordsMatch) { setError('Las contraseñas no coinciden'); return; }
    setError('');
    setLoading(true);
    try {
      const { email: confirmedEmail } = await registerApi(name.trim(), email.trim(), password);
      router.replace({ pathname: '/(auth)/verify' as any, params: { email: confirmedEmail, mode: 'verify' } });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (data?.resent) {
          router.replace({ pathname: '/(auth)/verify' as any, params: { email: data.email, mode: 'verify' } });
          return;
        }
        setError(data?.error ?? 'Error al crear la cuenta');
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

          <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, paddingBottom: 0 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 90, height: 90, marginBottom: 20 }}
              resizeMode="contain"
            />
            <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Crear cuenta</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginBottom: 32 }}>Únete a tu comunidad en HolyChat</Text>

            {/* Name */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Nombre completo</Text>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setError(''); }}
              placeholder="Tu nombre"
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="words"
              style={{
                backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12,
                paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
                borderWidth: 1.5, borderColor: colors.border, marginBottom: 20,
              }}
            />

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
                backgroundColor: colors.inputBg, color: colors.inputText, borderRadius: 12,
                paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
                borderWidth: 1.5, borderColor: colors.border, marginBottom: 20,
              }}
            />

            {/* Password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Contraseña</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
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
            <PasswordStrength password={password} />

            {/* Confirm password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Confirmar contraseña</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.inputBg, borderRadius: 12,
              borderWidth: 1.5, borderColor: confirm && !passwordsMatch ? colors.danger : colors.border,
              marginBottom: confirm && !passwordsMatch ? 4 : 28,
            }}>
              <TextInput
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setError(''); }}
                placeholder="Repite tu contraseña"
                placeholderTextColor={colors.inputPlaceholder}
                secureTextEntry={!showConfirm}
                onSubmitEditing={handleRegister}
                returnKeyType="done"
                style={{ flex: 1, color: colors.inputText, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 }}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ padding: 14 }}>
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {confirm && !passwordsMatch && (
              <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 20 }}>Las contraseñas no coinciden</Text>
            )}

            {/* Error */}
            {error ? (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, marginBottom: 20, flexDirection: 'row', gap: 8 }}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleRegister}
              disabled={!valid || loading}
              style={{
                backgroundColor: valid ? colors.accent : colors.bgSecondary,
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                opacity: !valid ? 0.5 : 1,
              }}
            >
              {loading
                ? <ActivityIndicator color={colors.accentText} />
                : <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>Crear cuenta</Text>
              }
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>¿Ya tienes cuenta?</Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)}>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Inicia sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { useCallback, useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/useAuthStore';
import {
  getMaterialFeed,
  markMaterialViewed,
  type Material,
} from '../services/materialsService';

const BANNER_KEY = 'materialBannerDate';
const todayStr = () => new Date().toISOString().slice(0, 10);

// Banner no invasivo de un material nuevo. Aparece como máximo una vez al día y
// deja de salir si el usuario ya entró/descargó (el feed excluye los vistos).
export default function MaterialBanner() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [material, setMaterial] = useState<Material | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!token) return;
        const shown = await AsyncStorage.getItem(BANNER_KEY);
        if (shown === todayStr()) return; // ya se mostró hoy
        try {
          const data = await getMaterialFeed(token);
          if (active && data) setMaterial(data);
        } catch {
          // silencioso
        }
      })();
      return () => {
        active = false;
      };
    }, [token])
  );

  if (!material) return null;

  const close = async () => {
    await AsyncStorage.setItem(BANNER_KEY, todayStr());
    setMaterial(null);
  };

  const open = async () => {
    await AsyncStorage.setItem(BANNER_KEY, todayStr());
    if (token) markMaterialViewed(token, material._id).catch(() => {});
    setMaterial(null);
    router.push('/(tabs)/materiales' as any);
  };

  const img = material.coverImage || material.thumbnail;

  return (
    <View
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.accent,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        marginBottom: 16,
      }}
    >
      {img ? (
        <Image source={{ uri: img }} style={{ width: 54, height: 54, borderRadius: 12 }} />
      ) : (
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 12,
            backgroundColor: colors.bgPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="book-outline" size={24} color={colors.accent} />
        </View>
      )}
      <TouchableOpacity onPress={open} activeOpacity={0.8} style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 11 }}>📚 Nuevo material</Text>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }} numberOfLines={2}>
          {material.title}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={close} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

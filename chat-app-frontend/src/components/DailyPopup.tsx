import { useCallback, useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/useAuthStore';
import { markMaterialViewed } from '../services/materialsService';
import { getDailyPopup, type DailyPopup as DailyPopupData } from '../services/dailyPopupService';

const POPUP_KEY = 'dailyPopupDate';
const todayStr = () => new Date().toISOString().slice(0, 10);

// Popup diario no invasivo (esquina inferior de la pantalla principal). Rota por
// día entre materiales, peticiones de oración de mis grupos y actividades
// espirituales que creé. Se muestra como máximo una vez al día.
export default function DailyPopup() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [data, setData] = useState<DailyPopupData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!token) return;
        const shown = await AsyncStorage.getItem(POPUP_KEY);
        if (shown === todayStr()) return; // ya se mostró hoy
        try {
          const res = await getDailyPopup(token);
          if (active && res) setData(res);
        } catch {
          // silencioso
        }
      })();
      return () => {
        active = false;
      };
    }, [token])
  );

  if (!data) return null;

  const markShown = () => AsyncStorage.setItem(POPUP_KEY, todayStr());

  const close = async () => {
    await markShown();
    setData(null);
  };

  const open = async () => {
    await markShown();
    const d = data;
    setData(null);
    if (d.kind === 'material' && d.material) {
      if (token) markMaterialViewed(token, d.material._id).catch(() => {});
      router.push('/(tabs)/materiales' as any);
    } else if (d.kind === 'prayer' && d.prayer) {
      router.push({ pathname: '/group-prayer/[id]' as any, params: { id: d.prayer.groupId, highlight: d.prayer._id } });
    } else if (d.kind === 'activity' && d.activity) {
      router.push({ pathname: '/group-activities/[id]' as any, params: { id: d.activity.groupId, highlight: d.activity._id } });
    }
  };

  // Contenido por categoría: etiqueta, título, subtítulo, imagen/icono y CTA.
  let label = '';
  let title = '';
  let subtitle = '';
  let img: string | undefined;
  let iconName: keyof typeof Ionicons.glyphMap = 'sparkles';

  if (data.kind === 'material' && data.material) {
    label = '📚 Nuevo material';
    title = data.material.title;
    img = data.material.coverImage || data.material.thumbnail;
    iconName = 'book-outline';
  } else if (data.kind === 'prayer' && data.prayer) {
    label = '🙏 Petición de oración';
    title = data.prayer.content;
    subtitle = data.prayer.groupName
      ? `${data.prayer.groupName}${data.prayer.authorName ? ` · ${data.prayer.authorName}` : ''}`
      : data.prayer.authorName;
    iconName = 'heart-outline';
  } else if (data.kind === 'activity' && data.activity) {
    label = `${data.activity.emoji || '🔥'} Actividad espiritual`;
    title = data.activity.name;
    subtitle = data.activity.groupName;
    iconName = 'flame-outline';
  }

  const ctaLabel =
    data.kind === 'material' ? 'Ver material' : data.kind === 'prayer' ? 'Orar' : 'Ver actividad';

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        backgroundColor: colors.bgSecondary,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.accent,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 8,
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
          <Ionicons name={iconName} size={24} color={colors.accent} />
        </View>
      )}

      <TouchableOpacity onPress={open} activeOpacity={0.8} style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 11 }}>{label}</Text>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 3 }}>
          {ctaLabel} ›
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={close} hitSlop={8} style={{ padding: 4, alignSelf: 'flex-start' }}>
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

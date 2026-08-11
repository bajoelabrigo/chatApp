import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/useAuthStore';
import { markMaterialViewed } from '../services/materialsService';
import { cld } from '../lib/cldImage';
import {
  getDailyPopup,
  getPopupConfig,
  trackPopupEvent,
  canShowNow,
  emptyPopupState,
  todayStr,
  type DailyPopup as DailyPopupData,
  type PopupConfig,
  type PopupState,
} from '../services/dailyPopupService';

const POPUP_STATE_KEY = 'dailyPopupState';

async function readState(): Promise<PopupState> {
  try {
    const raw = await AsyncStorage.getItem(POPUP_STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PopupState) : null;
    if (parsed && parsed.date === todayStr()) return parsed;
  } catch {
    // estado corrupto → empezamos de cero
  }
  return emptyPopupState();
}

// Popup de la pantalla principal. Qué categorías rotan (materiales, oración,
// actividades, actualización de la app, anuncio del admin), cuántas veces al día
// aparece, cuánto dura en pantalla y en qué horas no debe salir lo controla el
// admin general desde el dashboard web; aquí solo se aplica.
export default function DailyPopup() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const [data, setData] = useState<DailyPopupData | null>(null);
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!token) return;
        const cfg = await getPopupConfig();
        if (!cfg || !active) return;
        const state = await readState();
        if (!canShowNow(cfg, state)) return;

        const res = await getDailyPopup(token, cfg, state);
        if (!res || !active) return;

        // Se cuenta como "mostrado" en cuanto aparece: así el límite de veces al
        // día y la separación mínima se respetan aunque el usuario no lo toque.
        const next: PopupState = {
          date: todayStr(),
          count: state.count + 1,
          lastAt: Date.now(),
          kinds: [...state.kinds, res.kind],
        };
        await AsyncStorage.setItem(POPUP_STATE_KEY, JSON.stringify(next));
        trackPopupEvent(token, res.kind, 'views');

        setConfig(cfg);
        setData(res);
      })();
      return () => {
        active = false;
      };
    }, [token])
  );

  // Autocierre: el admin fija los segundos (0 = se queda hasta que lo cierren).
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const secs = config?.durationSeconds ?? 0;
    if (data && secs > 0) {
      closeTimer.current = setTimeout(() => setData(null), secs * 1000);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [data, config?.durationSeconds]);

  if (!data) return null;

  const close = () => {
    if (token) trackPopupEvent(token, data.kind, 'dismissals');
    setData(null);
  };

  const open = () => {
    const d = data;
    setData(null);
    if (token) trackPopupEvent(token, d.kind, 'clicks');

    if (d.kind === 'material' && d.material) {
      if (token) markMaterialViewed(token, d.material._id).catch(() => {});
      router.push('/menu/materiales' as any);
    } else if (d.kind === 'prayer' && d.prayer) {
      router.push({ pathname: '/group-prayer/[id]' as any, params: { id: d.prayer.groupId, highlight: d.prayer._id } });
    } else if (d.kind === 'activity' && d.activity) {
      router.push({ pathname: '/group-activities/[id]' as any, params: { id: d.activity.groupId, highlight: d.activity._id } });
    } else if (d.kind === 'app' && d.appUpdate) {
      // Descarga directa del APK nuevo (se instala encima de la actual).
      Linking.openURL(d.appUpdate.apkUrl || d.appUpdate.downloadUrl).catch(() => {});
    } else if (d.kind === 'custom' && d.custom?.url) {
      const url = d.custom.url;
      // Enlaces internos ("/(tabs)/…" o "/group-prayer/…") navegan dentro de la app.
      if (url.startsWith('/')) router.push(url as any);
      else Linking.openURL(url).catch(() => {});
    }
  };

  // Contenido por categoría: etiqueta, título, subtítulo, imagen/icono y CTA.
  let label = '';
  let title = '';
  let subtitle = '';
  let img: string | undefined;
  let iconName: keyof typeof Ionicons.glyphMap = 'sparkles';
  let ctaLabel = 'Ver';

  if (data.kind === 'material' && data.material) {
    label = '📚 Nuevo material';
    title = data.material.title;
    img = data.material.coverImage || data.material.thumbnail;
    iconName = 'book-outline';
    ctaLabel = 'Ver material';
  } else if (data.kind === 'prayer' && data.prayer) {
    label = '🙏 Petición de oración';
    title = data.prayer.content;
    subtitle = data.prayer.groupName
      ? `${data.prayer.groupName}${data.prayer.authorName ? ` · ${data.prayer.authorName}` : ''}`
      : data.prayer.authorName;
    iconName = 'heart-outline';
    ctaLabel = 'Orar';
  } else if (data.kind === 'activity' && data.activity) {
    label = `${data.activity.emoji || '🔥'} Actividad espiritual`;
    title = data.activity.name;
    subtitle = data.activity.groupName;
    iconName = 'flame-outline';
    ctaLabel = 'Ver actividad';
  } else if (data.kind === 'app' && data.appUpdate) {
    label = '⬇️ Actualización disponible';
    title = data.appUpdate.title;
    subtitle = data.appUpdate.body;
    iconName = 'cloud-download-outline';
    ctaLabel = `Descargar v${data.appUpdate.latestVersion}`;
  } else if (data.kind === 'custom' && data.custom) {
    label = '📣 Anuncio';
    title = data.custom.title;
    subtitle = data.custom.body;
    img = data.custom.imageUrl || undefined;
    iconName = 'megaphone-outline';
    ctaLabel = data.custom.ctaLabel || 'Ver más';
  }

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
        <Image source={{ uri: cld(img, 54) }} style={{ width: 54, height: 54, borderRadius: 12 }} />
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
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={2}>
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

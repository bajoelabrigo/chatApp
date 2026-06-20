import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useAuthStore } from '../src/store/useAuthStore';
import { useNotificationsStore } from '../src/store/useNotificationsStore';
import type { NotificationItem, NotificationKind } from '../src/services/notificationService';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

const KIND_ORDER: NotificationKind[] = [
  'reminder', 'material', 'chat', 'missed_call', 'prayer_pray', 'prayer', 'activity',
];
const KIND_TITLE: Record<NotificationKind, string> = {
  reminder: 'Hoy',
  material: 'Materiales nuevos',
  chat: 'Mensajes',
  missed_call: 'Llamadas perdidas',
  prayer_pray: 'Oraciones por tus peticiones',
  prayer: 'Peticiones de oración',
  activity: 'Actividades',
};

function kindIcon(kind: NotificationKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'reminder': return 'today';
    case 'material': return 'library';
    case 'chat': return 'chatbubble-ellipses';
    case 'missed_call': return 'call';
    case 'prayer_pray': return 'people';
    case 'prayer': return 'heart';
    case 'activity': return 'flame';
  }
}

function kindColor(kind: NotificationKind, colors: any): string {
  switch (kind) {
    case 'reminder': return colors.accent;
    case 'material': return '#6366F1';
    case 'chat': return colors.accent;
    case 'missed_call': return colors.danger;
    case 'prayer_pray': return '#8B5CF6';
    case 'prayer': return '#22C55E';
    case 'activity': return '#F59E0B';
  }
}

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme();
  const { token } = useAuthStore();
  const { items, loading, fetchNotifications, markSeen, markRead, dismiss } =
    useNotificationsStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchNotifications(token).then(() => markSeen(token));
  }, [token]);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchNotifications(token);
    await markSeen(token);
    setRefreshing(false);
  }, [token]);

  const sections = useMemo(() => {
    const grouped: Record<NotificationKind, NotificationItem[]> = {
      reminder: [], material: [], chat: [], missed_call: [], prayer_pray: [], prayer: [], activity: [],
    };
    for (const it of items) grouped[it.kind].push(it);
    return KIND_ORDER
      .filter((k) => grouped[k].length > 0)
      .map((k) => ({ key: k, title: KIND_TITLE[k], data: grouped[k] }));
  }, [items]);

  const handlePress = useCallback((it: NotificationItem) => {
    const { screen, id } = it.nav;
    if (screen === 'activities-tab') { router.push('/(tabs)/actividades' as any); return; }
    if (screen === 'material') { router.push('/(tabs)/materiales' as any); return; }
    if (!id) return;
    if (screen === 'chat') router.push(`/chat/${id}` as any);
    else if (screen === 'prayer') router.push(`/group-prayer/${id}` as any);
    else if (screen === 'activities') router.push(`/group-activities/${id}` as any);
  }, []);

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const accent = kindColor(item.kind, colors);
    return (
      <TouchableOpacity
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: item.isNew
            ? (isDark ? 'rgba(99,102,241,0.10)' : 'rgba(59,130,246,0.06)')
            : 'transparent',
        }}
      >
        {/* Avatar / icono */}
        <View style={{ marginRight: 12 }}>
          {item.avatar ? (
            <Image
              source={{ uri: item.avatar }}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.avatarBg }}
            />
          ) : (
            <View style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: colors.avatarBg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {item.emoji ? (
                <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
              ) : (
                <Ionicons name={kindIcon(item.kind)} size={22} color={accent} />
              )}
            </View>
          )}
          {/* Badge de tipo en esquina */}
          <View style={{
            position: 'absolute', right: -2, bottom: -2,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: accent,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: colors.bgPrimary,
          }}>
            <Ionicons name={kindIcon(item.kind)} size={11} color="#FFFFFF" />
          </View>
        </View>

        {/* Texto */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: item.isNew ? '700' : '600' }}
            >
              {item.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8 }}>
              {relativeTime(item.timestamp)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>
              {item.body}
            </Text>
            {item.kind === 'chat' && (item.data?.unreadCount ?? 0) > 0 && (
              <View style={{
                minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
                backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  {item.data!.unreadCount! > 99 ? '99+' : item.data!.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Acciones: leído / eliminar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
          {!item.isRead && (
            <TouchableOpacity
              onPress={() => token && markRead(token, item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32, height: 32, borderRadius: 16, marginRight: 6,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(59,130,246,0.10)',
              }}
            >
              <Ionicons name="checkmark-done" size={17} color={colors.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => token && dismiss(token, item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 32, height: 32, borderRadius: 16,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
            }}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: colors.headerBg,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: '800', marginLeft: 4 }}>
          Notificaciones
        </Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={sections.length === 0 ? { flex: 1 } : { paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          renderSectionHeader={({ section }) => (
            <Text style={{
              color: colors.textMuted, fontSize: 13, fontWeight: '700',
              textTransform: 'uppercase', letterSpacing: 0.5,
              paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
            }}>
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Ionicons name="notifications-off-outline" size={56} color={colors.textMuted} />
              <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 16 }}>
                Sin notificaciones
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6 }}>
                Aquí verás tus chats pendientes, llamadas perdidas, peticiones de oración y actividades de tus grupos.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

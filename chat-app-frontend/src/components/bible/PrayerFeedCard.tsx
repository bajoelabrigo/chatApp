import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PrayerFeed } from '../../services/dailyPopupService';

// Tarjeta de petición de oración: una al azar, sin responder, de los grupos del
// usuario. La elige el backend (`/users/me/prayer-feed`, el mismo del popup
// diario) y devuelve null si no hay grupos o peticiones abiertas → no se pinta.
interface Props {
  prayer: PrayerFeed | null;
  praying: boolean; // ya pulsó "Estoy orando"
  colors: any;
  onPray: () => void;
}

export function PrayerFeedCard({ prayer, praying, colors, onPray }: Props) {
  if (!prayer) return null;

  return (
    <View style={{
      marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1, borderColor: colors.border,
    }}>
      <Text style={{
        color: colors.textMuted, fontSize: 11, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        Petición de oración · {prayer.groupName}
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 6 }}>
        {prayer.authorName}
      </Text>
      <Text
        style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6 }}
        numberOfLines={4}
      >
        {prayer.content}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <TouchableOpacity
          onPress={onPray}
          disabled={praying}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
            backgroundColor: praying ? '#22c55e' : colors.accent,
          }}
        >
          <Ionicons name={praying ? 'checkmark' : 'heart'} size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {praying ? 'Estás orando' : 'Estoy orando'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push(`/group-prayer/${prayer.groupId}` as any)}
          style={{
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            Ver en el grupo
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

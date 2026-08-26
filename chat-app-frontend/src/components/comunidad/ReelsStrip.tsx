import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { useReelsStore } from '../../store/useReelsStore';
import { getReels } from '../../services/reelService';
import { VideoPreviewCard } from './VideoPreviewCard';

// Carrusel de reels (tarjetas grandes con previo de video) para la pestaña
// "Reels" del feed, igual que la web.
export function ReelsStrip() {
  const { token } = useAuthStore();
  const { reels, setReels } = useReelsStore();

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getReels(token, 1, 10).then(setReels).catch(() => {});
    }, [token, setReels])
  );

  if (!token) return null;

  return (
    <View style={{ paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="play-circle" size={18} color="#3b82f6" />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#333' }}>Reels</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/reels' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, color: '#3b82f6', fontWeight: '600' }}>Ver todos</Text>
          <Ionicons name="chevron-forward" size={16} color="#3b82f6" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 12 }}>
        {reels.length === 0 ? (
          <Text style={{ color: '#888', fontSize: 13, paddingVertical: 20 }}>Todavía no hay reels.</Text>
        ) : (
          reels.map((reel) => (
            <VideoPreviewCard
              key={reel.id}
              reel={reel}
              size="lg"
              onPress={() => router.push({ pathname: '/reels', params: { id: reel.id } } as any)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

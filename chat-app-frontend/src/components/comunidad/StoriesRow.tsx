import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { useReelsStore } from '../../store/useReelsStore';
import { getStories } from '../../services/reelService';
import { VideoPreviewCard } from './VideoPreviewCard';

// Carrusel de historias (tarjetas pequeñas con previo de video) que va arriba
// del feed, igual que la web. Tocar una abre el visor; "+" crea una historia.
export function StoriesRow() {
  const { token } = useAuthStore();
  const { stories, setStories } = useReelsStore();

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getStories(token).then(setStories).catch(() => {});
    }, [token, setStories])
  );

  if (!token) return null;

  return (
    <View style={{ paddingVertical: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 12 }}>
        {/* Crear historia */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/reel-create', params: { kind: 'story' } } as any)}
          activeOpacity={0.85}
          style={{ width: 100, aspectRatio: 9 / 16, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(59,130,246,0.08)' }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '700' }}>Crear</Text>
        </TouchableOpacity>

        {stories.map((story) => (
          <VideoPreviewCard
            key={story.id}
            reel={story}
            size="sm"
            onPress={() => router.push({ pathname: '/stories', params: { index: String(stories.indexOf(story)) } } as any)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

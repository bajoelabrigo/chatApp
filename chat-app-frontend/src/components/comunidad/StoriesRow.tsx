import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { useReelsStore } from '../../store/useReelsStore';
import { getStories } from '../../services/reelService';

// Carrusel de historias (avatares con anillo) que va arriba del feed. Tocar
// una abre el visor; el "+" lleva a crear una historia (24 h).
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 14 }}>
        {/* Tu historia: crear */}
        <TouchableOpacity
          onPress={() => router.push('/reel-create' as any)}
          style={{ alignItems: 'center', width: 66, gap: 4 }}
        >
          <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={30} color="#3b82f6" />
          </View>
          <Text style={{ fontSize: 11, color: '#888', textAlign: 'center' }} numberOfLines={1}>Tu historia</Text>
        </TouchableOpacity>

        {/* Historias activas */}
        {stories.map((story) => {
          const seen = story.viewed;
          return (
            <TouchableOpacity
              key={story.id}
              onPress={() => router.push({ pathname: '/stories', params: { index: String(stories.indexOf(story)) } } as any)}
              style={{ alignItems: 'center', width: 66, gap: 4 }}
            >
              <View
                style={{
                  width: 60, height: 60, borderRadius: 30, padding: 2.5,
                  borderWidth: 2, borderColor: seen ? '#9ca3af' : '#3b82f6',
                  backgroundColor: '#fff',
                }}
              >
                {story.author.avatar ? (
                  <Image source={{ uri: story.author.avatar }} style={{ width: '100%', height: '100%', borderRadius: 28 }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, borderRadius: 28, backgroundColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#4b5563' }}>{story.author.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11, color: '#666', textAlign: 'center' }} numberOfLines={1}>{story.author.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

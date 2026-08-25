import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, Pressable, useWindowDimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useAuthStore } from '../src/store/useAuthStore';
import { useReelsStore } from '../src/store/useReelsStore';
import { getReels, toggleReelLike, addReelView, type Reel } from '../src/services/reelService';
import { videoPlayUrl } from '../src/lib/cldImage';
import { timeAgo } from '../src/utils/timeAgo';

// Feed vertical de Reels (cortos permanentes, estilo Instagram).
const PAGE = 10;

function ReelVideo({ reel, active }: { reel: Reel; active: boolean }) {
  const player = useVideoPlayer(videoPlayUrl(reel.videoUrl), (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
    return () => player.pause();
  }, [active, player]);
  return (
    <VideoView
      player={player}
      style={{ flex: 1, backgroundColor: '#000' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function ReelYouTube({ reel }: { reel: Reel }) {
  return (
    <WebView
      source={{
        uri: `https://www.youtube.com/embed/${reel.youtubeVideoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`,
      }}
      style={{ flex: 1, backgroundColor: '#000' }}
      allowsFullscreenVideo
    />
  );
}

export default function ReelsScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const { reels, setReels, appendReels, updateLike, updateViewed } = useReelsStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const viewedRef = useRef<Set<string>>(new Set());
  const { height } = useWindowDimensions();

  const load = useCallback(
    async (p: number, fresh = false) => {
      if (!token) return;
      try {
        const data = await getReels(token, p, PAGE);
        if (fresh) setReels(data);
        else appendReels(data);
        setPage(p);
        setHasMore(data.length === PAGE);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, setReels, appendReels]
  );

  useFocusEffect(
    useCallback(() => {
      load(1, true);
    }, [load])
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: any) => {
      const first = viewableItems?.[0]?.item as Reel | undefined;
      setActiveId(first?.id ?? null);
      if (first && token && !viewedRef.current.has(first.id)) {
        viewedRef.current.add(first.id);
        addReelView(token, first.id).then(() => updateViewed(first.id)).catch(() => {});
      }
    }
  ).current;

  const onLike = async (reel: Reel) => {
    if (!token) return;
    try {
      const { liked, count } = await toggleReelLike(token, reel.id);
      updateLike(reel.id, liked, count);
    } catch { /* best-effort */ }
  };

  const renderItem = ({ item }: { item: Reel }) => {
    const isActive = item.id === activeId;
    return (
      <View style={{ height, backgroundColor: '#000' }}>
        {item.youtubeVideoId ? (
          <ReelYouTube reel={item} />
        ) : (
          <ReelVideo reel={item} active={isActive} />
        )}

        {/* Capa de info derecha: like, autor, caption */}
        <View
          style={{
            position: 'absolute', right: 12, bottom: 110, alignItems: 'center', gap: 18,
          }}
        >
          <Pressable onPress={() => onLike(item)} style={{ alignItems: 'center', gap: 3 }}>
            <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={32} color={item.liked ? '#ff2d55' : '#fff'} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{item.likeCount}</Text>
          </Pressable>
        </View>

        <View style={{ position: 'absolute', left: 14, right: 70, bottom: 70 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {item.author.avatar ? (
              <Image source={{ uri: item.author.avatar }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#333' }} />
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{item.author.name[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{item.author.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{timeAgo(item.createdAt)}</Text>
          </View>
          {!!item.caption && (
            <Text style={{ color: '#fff', fontSize: 14, lineHeight: 19 }} numberOfLines={4}>
              {item.caption}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Reels</Text>
          <TouchableOpacity
            onPress={() => router.push('/reel-create' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Crear</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={() => hasMore && load(page + 1)}
          onEndReachedThreshold={0.5}
          onRefresh={() => { setRefreshing(true); load(1, true); }}
          refreshing={refreshing}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={5}
          ListEmptyComponent={
            <View style={{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 24 }}>
              <Ionicons name="videocam-outline" size={48} color="#555" />
              <Text style={{ color: '#aaa', marginTop: 12, textAlign: 'center', fontSize: 15 }}>
                Todavía no hay reels. ¡Crea el primero con el botón "Crear"!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

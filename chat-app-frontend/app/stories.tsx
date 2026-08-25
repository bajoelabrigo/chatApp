import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Pressable, Modal, ActivityIndicator, useWindowDimensions, StyleSheet, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Animated } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useAuthStore } from '../src/store/useAuthStore';
import { useReelsStore } from '../src/store/useReelsStore';
import { addReelView, getReelViewers, type Reel, type ReelViewer } from '../src/services/reelService';
import { videoPlayUrl } from '../src/lib/cldImage';

// Historia de video en pantalla completa, con barras de progreso, tocar para
// avanzar/retroceder y (para las propias) quién la vio.
const TAP_GAP = 90; // franja central: pausar/reanudar

function StoryItem({
  story, index, total, active, paused, onNext, onPrev, onTogglePause, onOpenViewers,
}: {
  story: Reel; index: number; total: number; active: boolean;
  paused: boolean; onNext: () => void; onPrev: () => void;
  onTogglePause: () => void; onOpenViewers: () => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const isMine = story.author.id === user?.id;

  const player = useVideoPlayer(story.videoUrl ? videoPlayUrl(story.videoUrl) : '', (p) => { p.loop = false; });
  const event = useEvent(player, 'timeUpdate', {
    currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0,
  });
  const currentTime = event?.currentTime ?? 0;
  const duration = player.duration;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
    return () => player.pause();
  }, [active, paused, player]);

  useEffect(() => {
    if (!story.videoUrl) return;
    const sub = player.addListener('playToEnd', () => onNext());
    return () => sub.remove();
  }, [player, onNext]);

  // YouTube: sin eventos de progreso → barra indeterminada.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!story.youtubeVideoId) return;
    Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 8000, useNativeDriver: false })).start();
    return () => pulse.stopAnimation();
  }, [story.youtubeVideoId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {story.youtubeVideoId ? (
        <WebView
          source={{ uri: `https://www.youtube.com/embed/${story.youtubeVideoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1` }}
          style={{ flex: 1 }}
          allowsFullscreenVideo
        />
      ) : (
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
      )}

      {/* Barra de progreso */}
      <View style={{ position: 'absolute', top: 46, left: 10, right: 10, flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => {
          const fill = i < index ? 1 : i > index ? 0 : story.youtubeVideoId ? null : progress;
          return (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
              {fill !== null ? (
                <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: '#fff' }} />
              ) : (
                <Animated.View
                  style={{ width: '100%', height: '100%', backgroundColor: '#fff', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Cabecera */}
      <View style={{ position: 'absolute', top: 56, left: 14, right: 14, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {story.author.avatar ? (
          <Image source={{ uri: story.author.avatar }} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.accent }} />
        ) : (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{story.author.name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }} numberOfLines={1}>{story.author.name}</Text>
        {isMine && (
          <TouchableOpacity onPress={onOpenViewers} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
            <Ionicons name="eye" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{story.viewCount}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Pie: caption */}
      {!!story.caption && (
        <View style={{ position: 'absolute', bottom: 40, left: 16, right: 16 }}>
          <Text style={{ color: '#fff', fontSize: 15, lineHeight: 20 }} numberOfLines={3}>{story.caption}</Text>
        </View>
      )}

      {/* Zonas táctiles */}
      <Pressable style={[StyleSheet.absoluteFillObject, { zIndex: 10 }] as any} onPress={(e) => {
        const { locationX, pageX } = e.nativeEvent;
        const width = globalWidth();
        if (pageX < width / 3) onPrev();
        else if (pageX > width - width / 3) onNext();
        else onTogglePause();
      }} />
    </View>
  );
}

// Ancho de pantalla para las zonas táctiles (el layout real se mide en el padre).
let _width = 390;
const globalWidth = () => _width;

export default function StoriesScreen() {
  const { colors } = useTheme();
  const { index: indexParam } = useLocalSearchParams<{ index?: string }>();
  const { stories, updateViewed } = useReelsStore();
  const { token, user } = useAuthStore();
  const [current, setCurrent] = useState(Math.max(0, parseInt(indexParam ?? '0', 10) || 0));
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<ReelViewer[]>([]);
  const viewedRef = useRef<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  _width = width;

  const flatRef = useRef<FlatList<Reel>>(null);
  useEffect(() => {
    flatRef.current?.scrollToIndex({ index: current, animated: false });
  }, [current]);

  const markViewed = useCallback((story: Reel) => {
    if (!token || viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);
    addReelView(token, story.id).then(() => updateViewed(story.id)).catch(() => {});
  }, [token, updateViewed]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const item = viewableItems?.[0]?.item as Reel | undefined;
    if (item) {
      setCurrent(stories.findIndex((s) => s.id === item.id));
      markViewed(item);
    }
  }).current;

  const openViewers = async (story: Reel) => {
    if (!token) return;
    setViewersOpen(true);
    setViewers([]);
    try { setViewers(await getReelViewers(token, story.id)); } catch { /* sin viewers */ }
  };

  if (stories.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#888' }}>No hay historias activas</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" hidden />
      <FlatList
        ref={flatRef}
        data={stories}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={current}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index }) => (
          <View style={{ width, height: '100%' }}>
            <StoryItem
              story={item}
              index={index}
              total={stories.length}
              active={index === current}
              paused={paused}
              onNext={() => { if (index < stories.length - 1) { setPaused(false); flatRef.current?.scrollToIndex({ index: index + 1, animated: true }); } else router.back(); }}
              onPrev={() => { if (index > 0) { setPaused(false); flatRef.current?.scrollToIndex({ index: index - 1, animated: true }); } }}
              onTogglePause={() => setPaused((p) => !p)}
              onOpenViewers={() => openViewers(item)}
            />
          </View>
        )}
      />

      {/* Sheet de viewers (solo historias propias) */}
      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setViewersOpen(false)}>
          <View style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, maxHeight: '60%' }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, textAlign: 'center', paddingVertical: 14 }}>
              Quién la vio ({viewers.length})
            </Text>
            {viewers.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ paddingVertical: 20 }} />
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.userId}
                style={{ maxHeight: 300 }}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{item.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '500' }}>{item.name}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, Pressable, useWindowDimensions, Image, Share, Alert, Linking, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/comunidad' as any); };
import { StatusBar } from 'expo-status-bar';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useAuthStore } from '../src/store/useAuthStore';
import { useReelsStore } from '../src/store/useReelsStore';
import { getReels, toggleReelLike, addReelView, deleteReel, reportReel, registrarCompartido, reelShareUrl, type Reel } from '../src/services/reelService';
import { videoPlayUrl, videoThumbUrl } from '../src/lib/cldImage';
import { YouTubeEmbed } from '../src/components/comunidad/YouTubeEmbed';
import { ReelCommentsSheet } from '../src/components/comunidad/ReelCommentsSheet';
import { PrivateMessageSheet } from '../src/components/comunidad/PrivateMessageSheet';
import { timeAgo } from '../src/utils/timeAgo';

// Feed vertical de Reels (cortos permanentes, estilo Instagram) con barra de
// acción vertical (me gusta / comentar / compartir / eliminar).
const PAGE = 10;

function ReelVideo({ reel, active }: { reel: Reel; active: boolean }) {
  // El reproductor SOLO existe mientras el reel está en pantalla. Dos motivos,
  // y los dos daban PANTALLA NEGRA:
  //  1. Android limita los descodificadores de video (2-4 según el equipo). Con
  //     `windowSize` de la lista había varios `VideoView` vivos a la vez —más
  //     los WebView de los reels de YouTube— y a los que sobraban no les tocaba
  //     descodificador: negro, sin error.
  //  2. Pasar `null` como fuente libera el descodificador de verdad
  //     (`useVideoPlayer` crea un reproductor nuevo al cambiar la fuente).
  // Mientras no hay reproductor se pinta el primer fotograma que sirve
  // Cloudinary, así que la tarjeta nunca está en negro.
  const poster = reel.videoUrl.includes('/video/upload/') ? videoThumbUrl(reel.videoUrl, 640) : null;
  const player = useVideoPlayer(active ? videoPlayUrl(reel.videoUrl) : null, (p) => {
    p.loop = true;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status }) ?? { status: 'idle' as const, error: undefined };

  // Sin limpieza que toque el reproductor: al salir de la pantalla expo-video
  // ya lo libera, y llamar `pause()` sobre un objeto liberado revienta el
  // render (pantalla en blanco).
  useEffect(() => {
    if (!active) return;
    try { player.play(); } catch { /* liberado */ }
  }, [active, player]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Póster: se ve antes de que el video cargue y en los reels que aún no
          tocan (sin él, la lista es un rectángulo negro mientras se desplaza). */}
      {poster && (status !== 'readyToPlay' || !active) && (
        <Image source={{ uri: poster }} style={{ ...StyleSheet.absoluteFillObject }} resizeMode="cover" />
      )}
      {active && (
        <VideoView
          player={player}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentFit="cover"
          nativeControls={false}
          // TextureView en vez del SurfaceView por defecto: el SurfaceView es
          // una ventana aparte del árbol de vistas y dentro de una lista que
          // pagina se queda EN NEGRO o pinta el fotograma del vecino.
          surfaceType="textureView"
        />
      )}
      {active && status === 'loading' && (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      {active && status === 'error' && (
        <Pressable
          onPress={() => Linking.openURL(reel.videoUrl).catch(() => {})}
          style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <Ionicons name="alert-circle-outline" size={40} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, paddingHorizontal: 30, textAlign: 'center' }}>
            No se pudo reproducir este video
          </Text>
          {!!error?.message && (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, paddingHorizontal: 30, textAlign: 'center' }}>
              {error.message}
            </Text>
          )}
          <Text style={{ color: '#fff', fontWeight: '700', marginTop: 4 }}>Abrir fuera de la app</Text>
        </Pressable>
      )}
    </View>
  );
}

function ReelYouTube({ reel, active }: { reel: Reel; active: boolean }) {
  // Si el dueño del video prohibió el embed (101/150), el reproductor no puede
  // hacer nada: se cae a la miniatura y se abre en la app de YouTube.
  const [failed, setFailed] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);

  if (failed !== null) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${reel.youtubeVideoId}`).catch(() => {})}
        style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}
      >
        {reel.thumbUrl ? (
          <Image source={{ uri: reel.thumbUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '700', paddingHorizontal: 20, textAlign: 'center' }}>{reel.youtubeTitle}</Text>
        )}
        <View style={{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play" size={32} color="#fff" />
        </View>
        <Text style={{ position: 'absolute', bottom: 150, color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
          Ver en YouTube (no se pudo incrustar · {failed})
        </Text>
      </TouchableOpacity>
    );
  }

  // El WebView solo se monta en el reel activo: cada uno se queda un
  // descodificador de video y con varios a la vez los de abajo salen en negro.
  if (!active) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!!reel.thumbUrl && (
          <Image source={{ uri: reel.thumbUrl }} style={{ ...StyleSheet.absoluteFillObject }} resizeMode="cover" />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <YouTubeEmbed
        videoId={reel.youtubeVideoId!}
        playing={active}
        muted={muted}
        onError={(code) => setFailed(code)}
      />
      <Pressable
        onPress={() => setMuted((m) => !m)}
        style={{ position: 'absolute', right: 14, top: 100, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function ReelsScreen() {
  const { colors } = useTheme();
  // Reel concreto al que hay que saltar (se toca una tarjeta del carrusel); sin
  // él, el feed abría siempre por el primero.
  const { id: openId } = useLocalSearchParams<{ id?: string }>();
  const { token, user } = useAuthStore();
  const { reels, setReels, appendReels, updateLike, updateViewed } = useReelsStore();
  const [activeId, setActiveId] = useState<string | null>(openId ?? null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [commentReel, setCommentReel] = useState<Reel | null>(null);
  const [mensajeReel, setMensajeReel] = useState<Reel | null>(null);
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

  const onComment = (reel: Reel) => setCommentReel(reel);

  const onShare = async (reel: Reel) => {
    const text = reel.caption || reel.youtubeTitle || 'Mira este reel en HolyChat';
    // Se avisa al autor aunque luego se cancele la hoja del sistema: no hay
    // forma de saberlo, y era la única interacción sin aviso ninguno.
    if (token) registrarCompartido(token, reel.id).catch(() => {});
    try {
      // El enlace lleva AL REEL, no a la lista: antes quien lo abría veía el
      // primero del feed y no el que le habían mandado.
      await Share.share({ message: `${text}\n${reelShareUrl(reel.id)}` });
    } catch { /* best-effort */ }
  };

  const onReport = (reel: Reel) => {
    Alert.alert('Denunciar', '¿Enviar este reel para que lo revise un administrador?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Denunciar', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await reportReel(token, reel.id);
            Alert.alert('Gracias', 'Lo revisaremos pronto.');
          } catch {
            Alert.alert('Error', 'No se pudo enviar la denuncia');
          }
        },
      },
    ]);
  };

  const onDelete = (reel: Reel) => {
    Alert.alert('Eliminar', '¿Eliminar este reel?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await deleteReel(token, reel.id);
            setReels(reels.filter((r) => r.id !== reel.id));
          } catch { /* best-effort */ }
        },
      },
    ]);
  };

  // El reel por el que se abre la lista (una tarjeta del carrusel, o el primero).
  const initialIndex = Math.max(0, reels.findIndex((r) => r.id === openId));

  const renderItem = ({ item, index }: { item: Reel; index: number }) => {
    // Hasta que la lista informa de qué hay a la vista, el activo es aquel por
    // el que se abrió: si no, el primer reel se quedaría quieto en su póster.
    const isActive = activeId ? item.id === activeId : index === initialIndex;
    const isMine = item.author.id === user?.id;
    return (
      <View style={{ height, backgroundColor: '#000' }}>
        {item.youtubeVideoId ? (
          <ReelYouTube reel={item} active={isActive} />
        ) : (
          <ReelVideo reel={item} active={isActive} />
        )}

        {/* Barra de acción vertical (derecha) */}
        <View style={{ position: 'absolute', right: 12, bottom: 110, alignItems: 'center', gap: 18 }}>
          <Pressable onPress={() => onLike(item)} style={{ alignItems: 'center', gap: 3 }}>
            <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={32} color={item.liked ? '#ff2d55' : '#fff'} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{item.likeCount}</Text>
          </Pressable>
          <Pressable onPress={() => onComment(item)} style={{ alignItems: 'center', gap: 3 }}>
            <Ionicons name="chatbubble-outline" size={28} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{item.commentCount ?? 0}</Text>
          </Pressable>
          {/* Mensaje PRIVADO al autor, junto a comentar. En los reels no existía
              y en las historias era una caja fija al pie que convivía con la de
              comentarios: dos cajas con consecuencias opuestas que parecían la
              misma cosa. */}
          {!isMine && (
            <Pressable onPress={() => setMensajeReel(item)} style={{ alignItems: 'center', gap: 3 }}>
              <Ionicons name="mail-outline" size={28} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Mensaje</Text>
            </Pressable>
          )}
          <Pressable onPress={() => onShare(item)} style={{ alignItems: 'center', gap: 3 }}>
            <Ionicons name="share-social-outline" size={28} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Compartir</Text>
          </Pressable>
          {!isMine && (
            <Pressable onPress={() => onReport(item)} style={{ alignItems: 'center', gap: 3 }}>
              <Ionicons name="flag-outline" size={26} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Denunciar</Text>
            </Pressable>
          )}
          {isMine && (
            <Pressable onPress={() => onDelete(item)} style={{ alignItems: 'center', gap: 3 }}>
              <Ionicons name="trash-outline" size={28} color="#ff2d55" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Eliminar</Text>
            </Pressable>
          )}
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
          {/* Flecha y título son un solo botón de volver: tocar "Reels"
              también sale, que es lo que se espera al leerlo como cabecera. */}
          <TouchableOpacity
            onPress={goBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Reels</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/reel-create', params: { kind: 'reel' } } as any)}
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
          initialScrollIndex={initialIndex}
          onScrollToIndexFailed={() => { /* getItemLayout lo evita; nunca romper la pantalla */ }}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
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

      <PrivateMessageSheet
        reel={mensajeReel}
        token={token}
        colors={colors}
        onClose={() => setMensajeReel(null)}
      />

      <ReelCommentsSheet
        reel={commentReel}
        token={token}
        colors={colors}
        onClose={() => setCommentReel(null)}
        onCountChange={(reelId, count) =>
          setReels(reels.map((r) => (r.id === reelId ? { ...r, commentCount: count } : r)))
        }
      />
    </View>
  );
}

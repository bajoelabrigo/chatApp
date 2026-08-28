import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserReels, type Reel } from '../../services/reelService';
import { videoThumbUrl } from '../../lib/cldImage';

/**
 * Rejilla con los reels de una persona, para su perfil. Espejo de
 * `holy_app/frontend/src/components/reels/UserReelsGrid.jsx`.
 *
 * Hasta ahora un reel solo existía mientras pasaba por el feed: después no había
 * ningún sitio donde ver lo que alguien había publicado, aunque es contenido
 * permanente. Las historias vivas van aparte y arriba, porque caducan.
 *
 * Se pinta la MINIATURA, nunca un reproductor por celda: una cuadrícula de
 * `VideoView` agota los descodificadores del teléfono y las de más abajo salen
 * en negro (es el mismo motivo por el que en el feed solo suena el reel activo).
 */
export function UserReelsGrid({ token, userId, colors }: { token: string; userId: string; colors: any }) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [stories, setStories] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  // 3 columnas con 2dp de hueco, dentro del padding de 16 de la pantalla.
  const celda = Math.floor((width - 32 - 4) / 3);

  useEffect(() => {
    let cancelado = false;
    getUserReels(token, userId)
      .then((d) => { if (!cancelado) { setReels(d.reels); setStories(d.stories); } })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [token, userId]);

  const portada = (r: Reel) =>
    r.youtubeVideoId
      ? r.thumbUrl || `https://i.ytimg.com/vi/${r.youtubeVideoId}/hqdefault.jpg`
      : videoThumbUrl(r.videoUrl, 320);

  if (loading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />;

  if (reels.length === 0 && stories.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>
        Todavía no ha publicado ningún reel.
      </Text>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {stories.length > 0 && (
        <>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
            Historias activas ({stories.length})
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            {stories.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: '/reels', params: { id: s.id } } as any)}
                style={{
                  width: 76, aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden',
                  backgroundColor: '#111',
                  borderWidth: 3,
                  borderColor: s.viewed ? 'rgba(150,150,150,0.45)' : colors.accent,
                }}
              >
                <Image source={{ uri: portada(s) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {reels.length > 0 && (
        <>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
            Reels ({reels.length})
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {reels.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/reels', params: { id: r.id } } as any)}
                style={{ width: celda, aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#111' }}
              >
                <Image source={{ uri: portada(r) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                <View style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 6, paddingVertical: 4,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="heart" size={11} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{r.likeCount ?? 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="eye" size={11} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{r.viewCount ?? 0}</Text>
                  </View>
                </View>
                <View style={{
                  position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="play" size={11} color="#fff" />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

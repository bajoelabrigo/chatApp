import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { cleanUrl } from '../../lib/postMedia';
import { videoPlayUrl, videoThumbUrl } from '../../lib/cldImage';

/**
 * Video adjunto a una publicación, reproducible DENTRO del feed (como
 * Facebook). Antes `post.image` con un video se pintaba en un `<Image>`: en el
 * móvil salía un hueco gris y en la web un enlace de descarga.
 *
 * El reproductor solo existe mientras se está viendo (`playing`): un
 * `VideoView` por publicación agotaría los descodificadores del teléfono —
 * Android suele permitir 2-4 a la vez y los que sobran salen EN NEGRO. Hasta
 * que se toca, lo que se ve es el primer fotograma servido por Cloudinary.
 */
export function PostVideo({ url, colors }: { url: string; colors: any }) {
  const src = cleanUrl(url);
  const poster = src.includes('/video/upload/') ? videoThumbUrl(src, 640) : null;
  const [playing, setPlaying] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);

  const player = useVideoPlayer(playing ? videoPlayUrl(src) : null, (p) => { p.loop = false; });
  const { status } = useEvent(player, 'statusChange', { status: player.status }) ?? { status: 'idle' as const };

  useEffect(() => {
    if (!poster) return;
    let cancelled = false;
    Image.getSize(poster, (w, h) => { if (!cancelled && w > 0 && h > 0) setAspect(w / h); }, () => {});
    return () => { cancelled = true; };
  }, [poster]);

  useEffect(() => {
    if (!playing) return;
    try { player.play(); } catch { /* liberado */ }
  }, [playing, player]);

  // Vertical se deja alto (hasta 4:5) y horizontal se respeta; sin dato aún,
  // 16:9 es lo que menos salta cuando llega la miniatura.
  const ratio = aspect ? Math.max(0.8, Math.min(1.91, aspect)) : 16 / 9;

  return (
    <View style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', aspectRatio: ratio }}>
      {playing ? (
        <>
          <VideoView
            player={player}
            style={{ flex: 1 }}
            contentFit="contain"
            nativeControls
            // TextureView: dentro de una lista que se desplaza, el SurfaceView
            // por defecto de Android se queda EN NEGRO (es una ventana aparte
            // que no sigue al contenido).
            surfaceType="textureView"
          />
          {status === 'loading' && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          {status === 'error' && (
            <Pressable
              onPress={() => Linking.openURL(src).catch(() => {})}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.75)' }}
            >
              <Ionicons name="alert-circle-outline" size={30} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13 }}>No se pudo reproducir el video</Text>
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Abrir fuera de la app</Text>
            </Pressable>
          )}
        </>
      ) : (
        <Pressable onPress={() => setPlaying(true)} style={{ flex: 1 }}>
          {poster && <Image source={{ uri: poster }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );
}

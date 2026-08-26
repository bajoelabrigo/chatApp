import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLinkMeta, hostnameOf } from '../../lib/linkMeta';
import { youtubeVideoId, youtubeThumbnail } from '../../lib/youtube';
import { cld } from '../../lib/cldImage';
import { YouTubeEmbed } from './YouTubeEmbed';

// Vista previa de un enlace dentro de un post — mismo modelo que la web
// (`holy_app/frontend/src/components/LinkPreview.jsx` + `LiteYouTube.jsx`):
// imagen a lo ancho, título, descripción, sitio y botón "Ver detalles". Los de
// YouTube son un facade: miniatura + título y, al tocar, el reproductor.

function YouTubeCard({ url, videoId, colors }: { url: string; videoId: string; colors: any }) {
  const [playing, setPlaying] = useState(false);
  const { data } = useLinkMeta(url);

  return (
    <View style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bgTertiary }}>
      <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
        {playing ? (
          <>
            <YouTubeEmbed videoId={videoId} playing muted={false} />
            <TouchableOpacity
              onPress={() => setPlaying(false)}
              style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setPlaying(true)} style={{ flex: 1 }}>
            <Image
              source={{ uri: cld(data?.image || youtubeThumbnail(url) || '', 360) }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>
      {!!data?.title && (
        <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 }}>
          {data.title}
        </Text>
      )}
    </View>
  );
}

export function PostLinkPreview({ url, colors }: { url: string; colors: any }) {
  const videoId = youtubeVideoId(url);
  if (videoId) return <YouTubeCard url={url} videoId={videoId} colors={colors} />;
  return <GenericCard url={url} colors={colors} />;
}

function GenericCard({ url, colors }: { url: string; colors: any }) {
  const { data, loading } = useLinkMeta(url);

  // Cargando: barra ligera, nunca un hueco vacío que salte al llegar los datos.
  if (loading) {
    return (
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
        <ActivityIndicator color={colors.accent} />
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{hostnameOf(url)}</Text>
      </View>
    );
  }

  // Sin metadata: el enlace desnudo, tocable (nunca se queda "cargando").
  if (!data) {
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(url).catch(() => {})}
        style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}
      >
        <Ionicons name="link" size={16} color={colors.accent} />
        <Text numberOfLines={2} style={{ color: colors.accent, fontSize: 13, flex: 1, textDecorationLine: 'underline' }}>{url}</Text>
      </TouchableOpacity>
    );
  }

  // Tarjeta al estilo de Facebook: imagen grande y, bajo ella, una franja con
  // el DOMINIO en mayúsculas y el título en negrita. Espejo de
  // `holy_app/frontend/src/components/LinkPreview.jsx`.
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => Linking.openURL(data.url).catch(() => {})}
      style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}
    >
      {!!data.image && (
        <Image
          source={{ uri: cld(data.image, 360) }}
          style={{ width: '100%', height: 200, backgroundColor: colors.bgTertiary }}
          resizeMode="cover"
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgTertiary, paddingHorizontal: 12, paddingVertical: 9 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {hostnameOf(data.url)}
          </Text>
          {!!data.title && (
            <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14.5, marginTop: 1 }}>
              {data.title}
            </Text>
          )}
          {!!data.description && (
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {data.description}
            </Text>
          )}
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgPrimary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Ver detalles</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking } from 'react-native';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

// Caché a nivel de módulo: la misma URL puede aparecer en muchas burbujas y la
// lista se re-renderiza al scrollear. `undefined` = aún sin pedir; `null` = sin
// preview disponible; objeto = metadata.
const cache = new Map<string, LinkPreviewData | null>();

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const res = await fetch(
      `${API_URL}/public/link-preview?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) {
      cache.set(url, null);
      return null;
    }
    const data = (await res.json()) as LinkPreviewData;
    cache.set(url, data);
    return data;
  } catch {
    // No cacheamos el fallo de red: se reintenta al volver a montar.
    return null;
  }
}

interface Props {
  url: string;
  isMine: boolean;
  colors: any;
}

/**
 * Tarjeta de vista previa de enlace (estilo WhatsApp): imagen, título,
 * descripción y sitio. Los datos vienen del endpoint /public/link-preview del
 * backend, que lee los Open Graph tags del enlace (y usa oEmbed en YouTube).
 */
export function LinkPreview({ url, isMine, colors }: Props) {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(() =>
    cache.has(url) ? cache.get(url) : undefined,
  );

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url));
      return;
    }
    let active = true;
    fetchPreview(url).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [url]);

  // Sin metadata útil (o aún cargando sin nada que mostrar): no renderizamos la
  // tarjeta. El enlace en texto plano ya se muestra debajo, en la burbuja.
  if (!data || (!data.title && !data.image)) return null;

  // La burbuja propia solo es oscura (azul) en tema oscuro; en tema claro es
  // verde clara, así que el texto blanco sería invisible. Distinguimos por eso.
  const isDark = colors.bgPrimary === '#0A0A0A';
  const mineDark = isMine && isDark;
  const mineLight = isMine && !isDark;

  const cardBg = mineDark
    ? 'rgba(255,255,255,0.12)'
    : mineLight
      ? 'rgba(0,0,0,0.05)'
      : colors.bgTertiary;
  const titleColor = mineDark ? '#FFFFFF' : mineLight ? '#111b21' : colors.textPrimary;
  const descColor = mineDark
    ? 'rgba(255,255,255,0.80)'
    : mineLight
      ? '#5e6b73'
      : colors.textSecondary;
  const siteColor = mineDark ? 'rgba(255,255,255,0.65)' : colors.accent;
  const isYouTube = data.siteName === 'YouTube';

  // Tarjeta compacta horizontal (miniatura pequeña a la izquierda + texto),
  // estilo WhatsApp, para no ocupar tanto espacio en la burbuja.
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => Linking.openURL(data.url)}
      style={{
        flexDirection: 'row',
        width: 258,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: cardBg,
        marginBottom: 6,
      }}
    >
      {!!data.image && (
        <View style={{ position: 'relative' }}>
          <Image
            source={{ uri: data.image }}
            style={{ width: 64, height: 64 }}
            resizeMode="cover"
          />
          {isYouTube && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, marginLeft: 2 }}>▶</Text>
              </View>
            </View>
          )}
        </View>
      )}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 10,
          paddingVertical: 6,
          justifyContent: 'center',
        }}
      >
        {!!data.title && (
          <Text
            numberOfLines={2}
            style={{ color: titleColor, fontSize: 12.5, fontWeight: '700' }}
          >
            {data.title}
          </Text>
        )}
        {!!data.description && (
          <Text
            numberOfLines={1}
            style={{ color: descColor, fontSize: 11, marginTop: 1 }}
          >
            {data.description}
          </Text>
        )}
        {!!data.siteName && (
          <Text
            numberOfLines={1}
            style={{
              color: siteColor,
              fontSize: 10,
              marginTop: 2,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
            }}
          >
            {data.siteName}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

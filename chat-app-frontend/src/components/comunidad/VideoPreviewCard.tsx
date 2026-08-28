import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoThumbUrl } from '../../lib/cldImage';
import type { Reel } from '../../services/reelService';

// Tarjeta vertical de previo de video (historias pequeñas / reels grandes),
// igual que la web: miniatura + nombre del autor + marca de play.
// `ring`: anillo de color cuando la historia NO se ha visto (y apagado cuando
// sí), como en Instagram. El backend ya manda `viewed` en cada historia desde el
// principio y NADIE lo pintaba: sin ese anillo no hay forma de saber qué es
// nuevo, que es justo cómo se navegan las historias.
export function VideoPreviewCard({
  reel, size, onPress, ring = false, accent = '#3b82f6',
}: { reel: Reel; size: 'sm' | 'lg'; onPress: () => void; ring?: boolean; accent?: string }) {
  const isSm = size === 'sm';
  const sinVer = ring && !reel.viewed;
  const thumb = reel.youtubeVideoId ? reel.thumbUrl : videoThumbUrl(reel.videoUrl, isSm ? 200 : 320);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        width: isSm ? 100 : 150,
        aspectRatio: 9 / 16,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#111',
        borderWidth: ring ? 3 : 0,
        borderColor: sinVer ? accent : 'rgba(150,150,150,0.45)',
      }}
    >
      <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{reel.author.name}</Text>
        {!isSm && !!reel.caption && <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 2 }} numberOfLines={2}>{reel.caption}</Text>}
      </View>
      <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="play" size={12} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

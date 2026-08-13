import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useVoiceStore } from '../../store/useVoiceStore';

// Barra flotante de la nota de voz que sigue sonando fuera de su chat (igual
// que WhatsApp). Sin ella el audio seguiría sonando pero no habría forma de
// pararlo sin volver a la conversación.
export function VoiceMiniPlayer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const messageId = useVoiceStore((s) => s.messageId);
  const conversationId = useVoiceStore((s) => s.conversationId);
  const title = useVoiceStore((s) => s.title);
  const playing = useVoiceStore((s) => s.playing);
  const position = useVoiceStore((s) => s.position);
  const duration = useVoiceStore((s) => s.duration);
  const pause = useVoiceStore((s) => s.pause);
  const play = useVoiceStore((s) => s.play);
  const stop = useVoiceStore((s) => s.stop);
  const uri = useVoiceStore((s) => s.uri);

  // Dentro de su propio chat manda la burbuja: la barra sobra.
  const inItsChat = !!conversationId && pathname === `/chat/${conversationId}`;
  if (!messageId || !uri || !conversationId || inItsChat) return null;

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const left = Math.max(0, duration - position);
  const mm = `${Math.floor(left / 60)}:${Math.floor(left % 60).toString().padStart(2, '0')}`;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 }}
    >
      <Pressable
        onPress={() => router.push(`/chat/${conversationId}` as any)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          backgroundColor: colors.bgSecondary,
          borderRadius: 24,
          paddingHorizontal: 8,
          paddingVertical: 8,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            playing
              ? pause()
              : play({ uri, messageId, conversationId, title: title || 'Nota de voz' }).catch(() => {})
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, marginLeft: playing ? 0 : 2 }}>{playing ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
            🎤 {title || 'Nota de voz'}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.bgPrimary, marginTop: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', borderRadius: 2, backgroundColor: colors.accent, width: `${Math.round(progress * 100)}%` }} />
          </View>
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: 11, minWidth: 34, textAlign: 'right' }}>{mm}</Text>

        <TouchableOpacity onPress={stop} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

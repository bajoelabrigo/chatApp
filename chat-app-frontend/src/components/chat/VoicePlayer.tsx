import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '../../context/ThemeContext';
import { useVoiceStore, cachedDuration, rememberDuration } from '../../store/useVoiceStore';

interface Props {
  uri: string;
  isMine: boolean;
  /** Identifica la nota dentro del reproductor global (una sola suena a la vez). */
  messageId: string;
  conversationId: string;
  /** Quién la mandó — lo enseña la barra flotante al salir del chat. */
  senderName?: string;
  onLongPress?: () => void;
}

function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VoicePlayer({ uri, isMine, messageId, conversationId, senderName, onLongPress }: Props) {
  const { colors } = useTheme();

  // Estado del reproductor GLOBAL: solo la nota activa lee valores reales, así
  // que las demás burbujas no se repintan mientras esta suena.
  const isActive = useVoiceStore((s) => s.messageId === messageId);
  const isPlaying = useVoiceStore((s) => s.messageId === messageId && s.playing);
  const isBuffering = useVoiceStore((s) => s.messageId === messageId && s.buffering);
  const activePosition = useVoiceStore((s) => (s.messageId === messageId ? s.position : 0));
  const activeDuration = useVoiceStore((s) => (s.messageId === messageId ? s.duration : 0));
  const toggle = useVoiceStore((s) => s.toggle);

  // Reproductor LOCAL: solo para saber cuánto dura la nota antes de tocarla.
  // Mientras esta nota es la activa se le pasa `null` (no carga nada): quien
  // manda entonces es el reproductor global.
  const meta = useAudioPlayer(isActive ? null : { uri }, { updateInterval: 1000 });
  const metaStatus = useAudioPlayerStatus(meta);

  useEffect(() => {
    if (!isActive && metaStatus.duration > 0) rememberDuration(uri, metaStatus.duration);
  }, [isActive, metaStatus.duration, uri]);

  const duration = isActive
    ? activeDuration || cachedDuration(uri)
    : metaStatus.duration || cachedDuration(uri);
  const position = isActive ? activePosition : 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const togglePlay = () => {
    toggle({ uri, messageId, conversationId, title: senderName || 'Nota de voz' }).catch(() => {});
  };

  // La burbuja propia solo es oscura (azul) en tema oscuro; en claro es verde
  // clara, así que los blancos serían invisibles → usamos tonos oscuros.
  const isDark = colors.bgPrimary === '#0A0A0A';
  const mineDark = isMine && isDark;

  const iconColor = isMine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const trackBg = mineDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  const progressBar = mineDark ? 'rgba(255,255,255,0.85)' : colors.accent;
  const timeColor = isMine ? colors.bubbleMineSubtext : colors.bubbleTheirsSubtext;
  const buttonBg = mineDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, paddingHorizontal: 4, minWidth: 160 }}>
      <TouchableOpacity
        onPress={togglePlay}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: buttonBg, alignItems: 'center', justifyContent: 'center' }}
      >
        {isBuffering ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Text style={{ color: iconColor, fontSize: 14, marginLeft: isPlaying ? 0 : 2 }}>{isPlaying ? '⏸' : '▶'}</Text>
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: trackBg, overflow: 'hidden' }}>
          <View
            style={{ height: '100%', borderRadius: 3, backgroundColor: progressBar, width: `${Math.round(progress * 100)}%` }}
          />
        </View>
        <Text style={{ color: timeColor, fontSize: 10, marginTop: 3 }}>
          {duration > 0 ? formatDuration(isPlaying ? position : duration) : '0:00'}
        </Text>
      </View>
    </View>
  );
}

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  uri: string;
  isMine: boolean;
  onLongPress?: () => void;
}

function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VoicePlayer({ uri, isMine, onLongPress }: Props) {
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri }, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const position = status.currentTime ?? 0;
  const duration = status.duration ?? 0;
  const progress = duration > 0 ? position / duration : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish]);

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        await setAudioModeAsync({ playsInSilentMode: true });
        player.play();
      }
    } catch {}
  };

  const iconColor = isMine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const trackBg = isMine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  const progressBar = isMine ? 'rgba(255,255,255,0.85)' : colors.accent;
  const timeColor = isMine ? colors.bubbleMineSubtext : colors.bubbleTheirsSubtext;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, paddingHorizontal: 4, minWidth: 160 }}>
      <TouchableOpacity
        onPress={togglePlay}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' }}
      >
        {status.isBuffering && !isPlaying ? (
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

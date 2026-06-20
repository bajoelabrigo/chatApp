import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StatusBar, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from '@livekit/react-native-webrtc';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../src/store/useCallStore';
import { useTheme } from '../src/context/ThemeContext';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CallScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    callState, callType, peerName, peerAvatar,
    localStream, remoteStream,
    isMuted, isCameraOff, isSpeaker,
    toggleMute, toggleCamera, toggleSpeaker, endCall,
  } = useCallStore();

  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (callState === 'connected') {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  useEffect(() => {
    if (callState === 'idle') {
      router.canGoBack() ? router.back() : router.replace('/(tabs)/chats' as any);
    }
  }, [callState]);

  const isVideo = callType === 'video';
  const hasRemote = !!remoteStream;
  const hasLocal = !!localStream;

  const overlayBg = isDark ? 'rgba(13,15,30,0.92)' : 'rgba(234,238,255,0.94)';
  const callBg = colors.callBg;

  const PeerPlaceholder = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: callBg }}>
      {peerAvatar ? (
        <Image source={{ uri: peerAvatar }} style={{ width: 128, height: 128, borderRadius: 64,
          shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 }} />
      ) : (
        <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: colors.avatarBg,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 16 }}>
          <Text style={{ color: isDark ? '#EEF2FF' : colors.accent, fontSize: 52, fontWeight: 'bold' }}>
            {peerName?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
      <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '600', marginTop: 20 }}>{peerName}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 8 }}>
        {callState === 'calling' ? 'Llamando...' : callState === 'connected' ? formatDuration(seconds) : 'Conectando...'}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: callBg }}>
      <StatusBar hidden={Platform.OS === 'android'} barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Main area: remote video or avatar */}
      {isVideo && hasRemote ? (
        <RTCView
          streamURL={(remoteStream as any).toURL()}
          style={{ flex: 1 }}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <PeerPlaceholder />
      )}

      {/* Duration badge for video calls with remote stream */}
      {isVideo && hasRemote && callState === 'connected' && (
        <View style={{ position: 'absolute', top: insets.top + 12, left: 16 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>{peerName}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>{formatDuration(seconds)}</Text>
        </View>
      )}

      {/* Local PiP (video calls only) */}
      {isVideo && hasLocal && !isCameraOff && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 16,
            width: 96,
            height: 136,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        >
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={{ flex: 1 }}
            objectFit="cover"
            mirror={true}
            zOrder={1}
          />
        </View>
      )}

      {/* Controls */}
      <View
        style={{
          paddingBottom: insets.bottom + 28,
          paddingTop: 24,
          paddingHorizontal: 32,
          backgroundColor: overlayBg,
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        <ControlButton
          icon={isMuted ? 'mic-off' : 'mic'}
          active={isMuted}
          activeColor={colors.danger}
          inactiveColor={colors.avatarBg}
          onPress={toggleMute}
          label={isMuted ? 'Silenciado' : 'Micrófono'}
          labelColor={colors.textSecondary}
          iconInactiveColor={colors.textPrimary}
        />

        <ControlButton
          icon={isSpeaker ? 'volume-high' : 'volume-medium'}
          active={isSpeaker}
          activeColor={colors.accent}
          inactiveColor={colors.avatarBg}
          onPress={toggleSpeaker}
          label={isSpeaker ? 'Altavoz' : 'Auricular'}
          labelColor={colors.textSecondary}
          iconInactiveColor={colors.textPrimary}
        />

        {isVideo && (
          <ControlButton
            icon={isCameraOff ? 'videocam-off' : 'videocam'}
            active={isCameraOff}
            activeColor={colors.danger}
            inactiveColor={colors.avatarBg}
            onPress={toggleCamera}
            label={isCameraOff ? 'Cám. off' : 'Cámara'}
            labelColor={colors.textSecondary}
            iconInactiveColor={colors.textPrimary}
          />
        )}

        {/* End call */}
        <TouchableOpacity
          onPress={endCall}
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ControlButton({
  icon, active, activeColor, inactiveColor, onPress, label, labelColor, iconInactiveColor,
}: {
  icon: any;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
  label: string;
  labelColor: string;
  iconInactiveColor: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <TouchableOpacity
        onPress={onPress}
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: active ? activeColor : inactiveColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={active ? '#fff' : iconInactiveColor} />
      </TouchableOpacity>
      <Text style={{ color: labelColor, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

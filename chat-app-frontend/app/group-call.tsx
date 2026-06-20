import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  isTrackReference,
  AudioSession,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Ionicons } from '@expo/vector-icons';
import { useGroupCallStore } from '../src/store/useGroupCallStore';
import { useTheme } from '../src/context/ThemeContext';

function GroupCallInner({ callType }: { callType: 'audio' | 'video' }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { endGroupCall } = useGroupCallStore();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);
  const allVideoTracks = [...cameraTracks, ...screenShareTracks];

  const [isSpeaker, setIsSpeaker] = useState(true);

  const toggleMic = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);

  const toggleSpeaker = useCallback(async () => {
    const next = !isSpeaker;
    setIsSpeaker(next);
    try {
      await AudioSession.selectAudioOutput(next ? 'speaker' : 'earpiece');
    } catch {}
  }, [isSpeaker]);

  const handleEnd = useCallback(() => {
    endGroupCall();
    router.canGoBack() ? router.back() : router.replace('/(tabs)/chats' as any);
  }, [endGroupCall]);

  const isVideo = callType === 'video';
  const participantCount = remoteParticipants.length + 1;
  const overlayBg = isDark ? 'rgba(10,10,10,0.92)' : 'rgba(244,247,255,0.92)';

  const localCameraTrack = allVideoTracks.find(
    (t) => isTrackReference(t) && t.participant.identity === localParticipant.identity
  );

  const remoteVideoTracks = allVideoTracks.filter(
    (t) => isTrackReference(t) && t.participant.identity !== localParticipant.identity
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar hidden={Platform.OS === 'android'} barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Llamada grupal</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            {participantCount} participante{participantCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Video grid (video calls) */}
      {isVideo ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 8, gap: 8 }}
        >
          {remoteParticipants.map((participant) => {
            const track = remoteVideoTracks.find(
              (t) => isTrackReference(t) && t.participant.identity === participant.identity
            );
            return (
              <View
                key={participant.identity}
                style={{
                  height: 240,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: colors.bgSecondary,
                }}
              >
                {track && isTrackReference(track) ? (
                  <VideoTrack trackRef={track} style={{ flex: 1 }} objectFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: 'bold' }}>
                        {participant.name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textPrimary, marginTop: 10, fontSize: 15 }}>{participant.name}</Text>
                  </View>
                )}
                {/* Name badge */}
                <View style={{ position: 'absolute', bottom: 8, left: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    {participant.name}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Local preview tile */}
          {localCameraTrack && isTrackReference(localCameraTrack) && isCameraEnabled && (
            <View style={{ height: 180, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSecondary }}>
              <VideoTrack trackRef={localCameraTrack} style={{ flex: 1 }} objectFit="cover" mirror />
              <View style={{ position: 'absolute', bottom: 8, left: 10 }}>
                <Text style={{ color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  Tú
                </Text>
              </View>
            </View>
          )}

          {remoteParticipants.length === 0 && (
            <View style={{ flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Esperando participantes...</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* Audio call – show participant avatars */
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 24 }}>
            {/* Local */}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold' }}>Tú</Text>
              </View>
              {!isMicrophoneEnabled && (
                <Ionicons name="mic-off" size={14} color={colors.danger} />
              )}
            </View>

            {remoteParticipants.map((p) => (
              <View key={p.identity} style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: 'bold' }}>
                    {p.name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{p.name}</Text>
              </View>
            ))}
          </View>

          {remoteParticipants.length === 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Esperando participantes...</Text>
          )}
        </View>
      )}

      {/* Controls */}
      <View
        style={{
          paddingBottom: insets.bottom + 28,
          paddingTop: 20,
          paddingHorizontal: 32,
          backgroundColor: overlayBg,
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        <ControlButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          active={!isMicrophoneEnabled}
          activeColor={colors.danger}
          inactiveColor={colors.avatarBg}
          onPress={toggleMic}
          label={isMicrophoneEnabled ? 'Micrófono' : 'Silenciado'}
          labelColor={colors.textSecondary}
        />

        <ControlButton
          icon={isSpeaker ? 'volume-high' : 'volume-medium'}
          active={isSpeaker}
          activeColor={colors.accent}
          inactiveColor={colors.avatarBg}
          onPress={toggleSpeaker}
          label={isSpeaker ? 'Altavoz' : 'Auricular'}
          labelColor={colors.textSecondary}
        />

        {isVideo && (
          <ControlButton
            icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
            active={!isCameraEnabled}
            activeColor={colors.danger}
            inactiveColor={colors.avatarBg}
            onPress={toggleCamera}
            label={isCameraEnabled ? 'Cámara' : 'Cám. off'}
            labelColor={colors.textSecondary}
          />
        )}

        <TouchableOpacity
          onPress={handleEnd}
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

export default function GroupCallScreen() {
  const { isActive, token, livekitUrl, callType, endGroupCall } = useGroupCallStore();

  if (!isActive || !token || !livekitUrl) {
    router.canGoBack() ? router.back() : router.replace('/(tabs)/chats' as any);
    return null;
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      connect
      audio
      video={callType === 'video'}
      onDisconnected={() => {
        endGroupCall();
        router.canGoBack() ? router.back() : router.replace('/(tabs)/chats' as any);
      }}
    >
      <GroupCallInner callType={callType} />
    </LiveKitRoom>
  );
}

function ControlButton({
  icon, active, activeColor, inactiveColor, onPress, label, labelColor,
}: {
  icon: any;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
  label: string;
  labelColor: string;
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
        <Ionicons name={icon} size={26} color="#fff" />
      </TouchableOpacity>
      <Text style={{ color: labelColor, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

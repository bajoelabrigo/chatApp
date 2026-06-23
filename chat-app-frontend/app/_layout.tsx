import 'react-native-get-random-values';
import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, Text, TouchableOpacity, Image, Modal } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { registerGlobals } from '@livekit/react-native';
import { useAuthStore } from '../src/store/useAuthStore';
import { connectSocket, disconnectSocket } from '../src/services/socketService';
import { useChatsStore } from '../src/store/useChatsStore';
import { useActivitiesStore } from '../src/store/useActivitiesStore';
import { useCallStore } from '../src/store/useCallStore';
import { useGroupCallStore } from '../src/store/useGroupCallStore';
import { playRingtone, playRingback, stop as stopRingtone, loadRingtonePreference } from '../src/services/ringtoneService';
import api from '../src/services/authService';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { triggerDailyActivityReminder } from '../src/utils/dailyActivityReminder';

registerGlobals();

loadRingtonePreference();

// Safe wrapper — expo-notifications native module is only available in development builds,
// not in Expo Go. All calls are no-ops when the module is unavailable.
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Expo Go — native push module not available, silently ignore
}

async function registerPushToken(authToken: string) {
  try {
    const Device = require('expo-device');
    if (!Device.isDevice) return;

    const Notifications = require('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } = existing === 'granted'
      ? { status: existing }
      : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
    await api.patch('/users/push-token', { expoPushToken: pushToken }, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    // Non-critical — push notifications require a development build
  }
}

function RootLayoutInner() {
  const [isReady, setIsReady] = useState(false);
  const { loadToken, token, isSignedIn, user } = useAuthStore();
  const { bindSocketEvents, unbindSocketEvents, setCurrentUserId } = useChatsStore();
  const { bindGroupEvents, unbindGroupEvents } = useActivitiesStore();
  const {
    bindCallSocketEvents, unbindCallSocketEvents,
    callState, incomingCall, acceptCall, rejectCall,
  } = useCallStore();
  const {
    bindGroupCallSocketEvents, unbindGroupCallSocketEvents,
    isActive: groupCallActive,
    incomingGroupCall,
    joinGroupCall, dismissGroupCall,
  } = useGroupCallStore();
  const { isDark, colors } = useTheme();

  useEffect(() => {
    loadToken().finally(() => setIsReady(true));
  }, []);

  // Deep-link al tocar una notificación push (p.ej. material nuevo).
  useEffect(() => {
    try {
      const Notifications = require('expo-notifications');
      const route = (data: any) => {
        if (data?.type === 'material') router.push('/(tabs)/materiales' as any);
      };
      // App abierta desde una notificación (estaba cerrada).
      Notifications.getLastNotificationResponseAsync?.().then((resp: any) => {
        if (resp) route(resp.notification?.request?.content?.data);
      });
      const sub = Notifications.addNotificationResponseReceivedListener((resp: any) => {
        route(resp?.notification?.request?.content?.data);
      });
      return () => sub?.remove?.();
    } catch {
      // Expo Go — módulo nativo no disponible
    }
  }, []);

  useEffect(() => {
    if (isSignedIn && token) {
      if (user?.id) setCurrentUserId(user.id);
      connectSocket(token);
      bindSocketEvents();
      bindGroupEvents();
      bindCallSocketEvents();
      bindGroupCallSocketEvents();
      registerPushToken(token);
      const remindersEnabled = user?.notificationSettings?.activityReminders !== false;
      triggerDailyActivityReminder(token, remindersEnabled);
    } else {
      unbindSocketEvents();
      unbindGroupEvents();
      unbindCallSocketEvents();
      unbindGroupCallSocketEvents();
      disconnectSocket();
    }
    return () => {
      unbindSocketEvents();
      unbindGroupEvents();
      unbindCallSocketEvents();
      unbindGroupCallSocketEvents();
      disconnectSocket();
    };
  }, [isSignedIn, token]);

  // Ringtone control — plays for both 1-on-1 and group incoming calls
  useEffect(() => {
    if (callState === 'receiving' || incomingGroupCall) playRingtone();
    else if (callState === 'calling') playRingback();
    else stopRingtone();
  }, [callState, incomingGroupCall]);

  // Navigate to 1-on-1 call screen
  const prevCallState = useRef(callState);
  useEffect(() => {
    const prev = prevCallState.current;
    prevCallState.current = callState;
    if (callState === 'calling' && prev === 'idle') {
      router.push('/call' as any);
    }
    if (callState === 'connected' && prev === 'receiving') {
      router.push('/call' as any);
    }
  }, [callState]);

  // Navigate to group call screen when isActive becomes true
  const prevGroupActive = useRef(groupCallActive);
  useEffect(() => {
    if (groupCallActive && !prevGroupActive.current) {
      router.push('/group-call' as any);
    }
    prevGroupActive.current = groupCallActive;
  }, [groupCallActive]);

  if (!isReady) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="call" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="group-call" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="contact/[id]" />
        <Stack.Screen name="u/[id]" />
        <Stack.Screen name="g/[id]" />
      </Stack>

      {/* Incoming 1-on-1 call overlay */}
      <Modal
        visible={callState === 'receiving' && !!incomingCall}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ width: '100%', backgroundColor: colors.bgSecondary, borderRadius: 28, padding: 32, alignItems: 'center' }}>
            {incomingCall?.callerAvatar ? (
              <Image source={{ uri: incomingCall.callerAvatar }} style={{ width: 96, height: 96, borderRadius: 20, marginBottom: 16 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 20, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 40, fontWeight: 'bold' }}>
                  {incomingCall?.callerName?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}

            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>
              Llamada {incomingCall?.callType === 'video' ? 'de video' : 'de voz'} entrante
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginBottom: 40 }}>
              {incomingCall?.callerName}
            </Text>

            <View style={{ flexDirection: 'row', gap: 48 }}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={rejectCall}
                  style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 30 }}>📵</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Rechazar</Text>
              </View>

              <View style={{ alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={acceptCall}
                  style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 30 }}>📞</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Aceptar</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Incoming group call overlay */}
      <Modal
        visible={!!incomingGroupCall}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ width: '100%', backgroundColor: colors.bgSecondary, borderRadius: 28, padding: 32, alignItems: 'center' }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 40 }}>👥</Text>
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>
              Llamada grupal {incomingGroupCall?.callType === 'video' ? 'de video' : 'de voz'}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
              {incomingGroupCall?.groupName}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 36 }}>
              Iniciada por {incomingGroupCall?.initiatorName}
            </Text>

            <View style={{ flexDirection: 'row', gap: 48 }}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={dismissGroupCall}
                  style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 30 }}>📵</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Declinar</Text>
              </View>

              <View style={{ alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => token && joinGroupCall(token)}
                  style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 30 }}>📞</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Unirse</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}

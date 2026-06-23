import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useTheme } from '../../src/context/ThemeContext';
import { createOrGetConversation, getUserProfile } from '../../src/services/conversationService';

// Deep link: chatapp://u/<userId>. Abre (o crea) el chat 1:1 con ese usuario.
export default function OpenUserDeepLink() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const { upsertConversation } = useChatsStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    (async () => {
      if (!token) {
        router.replace('/(auth)/login' as any);
        return;
      }
      if (!id) {
        router.replace('/(tabs)/chats' as any);
        return;
      }
      try {
        const [conv, profile] = await Promise.all([
          createOrGetConversation(token, id),
          getUserProfile(token, id).catch(() => null),
        ]);
        upsertConversation(conv);
        router.replace({
          pathname: '/chat/[id]' as any,
          params: { id: conv._id, name: profile?.name ?? '', avatar: profile?.avatar ?? '' },
        });
      } catch {
        router.replace('/(tabs)/chats' as any);
      }
    })();
  }, [id, token, upsertConversation]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

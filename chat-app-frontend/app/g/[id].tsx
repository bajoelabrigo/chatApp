import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useTheme } from '../../src/context/ThemeContext';

// Deep link: chatapp://g/<groupId>. Si eres miembro, abre el chat del grupo;
// si no, abre su perfil (que gestiona el acceso/errores).
export default function OpenGroupDeepLink() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const { conversations } = useChatsStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!token) {
      router.replace('/(auth)/login' as any);
      return;
    }
    if (!id) {
      router.replace('/(tabs)/chats' as any);
      return;
    }
    const group = conversations.find((c) => c._id === id && c.isGroup);
    if (group) {
      router.replace({
        pathname: '/chat/[id]' as any,
        params: {
          id: group._id,
          name: group.groupName ?? 'Grupo',
          isGroup: '1',
          memberCount: String(group.participants?.length ?? 0),
        },
      });
    } else {
      router.replace({ pathname: '/group-profile/[id]' as any, params: { id } });
    }
  }, [id, token, conversations]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

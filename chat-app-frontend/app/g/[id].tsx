import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useChatsStore } from '../../src/store/useChatsStore';
import { useTheme } from '../../src/context/ThemeContext';
import { joinGroup } from '../../src/services/conversationService';

// Deep link: chatapp://g/<groupId>. Si eres miembro, abre el chat del grupo;
// si no, se une por el enlace compartido y luego lo abre.
export default function OpenGroupDeepLink() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const { conversations, upsertConversation } = useChatsStore();
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

    const openChat = (group: any) =>
      router.replace({
        pathname: '/chat/[id]' as any,
        params: {
          id: group._id,
          name: group.groupName ?? 'Grupo',
          isGroup: '1',
          memberCount: String(group.participants?.length ?? 0),
        },
      });

    const group = conversations.find((c) => c._id === id && c.isGroup);
    if (group) {
      openChat(group);
      return;
    }

    // No es miembro todavía: unirse por el enlace y abrir el chat.
    (async () => {
      try {
        const joined = await joinGroup(token, id);
        if ((joined as any).pending) {
          Alert.alert(
            'Solicitud enviada',
            (joined as any).alreadyPending
              ? 'Tu solicitud ya está pendiente. Un administrador debe aprobar tu ingreso.'
              : 'Un administrador del grupo debe aprobar tu ingreso. Te avisaremos cuando seas aceptado.',
          );
          router.replace('/(tabs)/chats' as any);
          return;
        }
        upsertConversation(joined as any);
        openChat(joined);
      } catch {
        // Si falla (grupo inexistente, etc.), caer al perfil que muestra el error.
        router.replace({ pathname: '/group-profile/[id]' as any, params: { id } });
      }
    })();
  }, [id, token, conversations]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

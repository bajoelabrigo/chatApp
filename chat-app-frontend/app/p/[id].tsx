import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/context/ThemeContext';

// Deep link: chatapp://p/<postId>. Abre el detalle de la publicación.
export default function OpenPostDeepLink() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!token) {
      router.replace('/(auth)/login' as any);
      return;
    }
    if (!id) {
      router.replace('/comunidad' as any);
      return;
    }
    router.replace(`/post/${id}` as any);
  }, [id, token]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

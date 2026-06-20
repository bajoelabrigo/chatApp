import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/useAuthStore';

export default function Index() {
  const { isSignedIn } = useAuthStore();
  return <Redirect href={isSignedIn ? '/(tabs)/chats' : '/(auth)/sign-in'} />;
}

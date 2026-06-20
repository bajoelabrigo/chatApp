import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface Props {
  onPress: () => void;
  loading?: boolean;
}

export function GoogleButton({ onPress, loading = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="flex-row items-center justify-center bg-white border border-gray-300 rounded-xl px-6 py-4 shadow-sm active:opacity-80"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#075E54" />
      ) : (
        <>
          <View className="w-6 h-6 mr-3 items-center justify-center">
            <Text className="text-lg font-bold text-blue-500">G</Text>
          </View>
          <Text className="text-base font-semibold text-gray-700">
            Continuar con Google
          </Text>
        </>
      )}
    </Pressable>
  );
}


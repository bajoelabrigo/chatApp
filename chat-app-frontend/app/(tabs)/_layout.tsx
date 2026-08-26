import { Tabs, router } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../src/context/ThemeContext';
import FloatingTabBar from '../../src/components/FloatingTabBar';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: 'bold', color: colors.textPrimary },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.bgPrimary, borderTopWidth: 0, elevation: 0 },
        sceneStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="actividades"
        options={{
          title: 'Actividades',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'flame' : 'flame-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bible"
        options={{
          title: 'Biblia',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <FontAwesome5 name="bible" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ofrendas"
        options={{
          title: 'Ofrendas',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'heart' : 'heart-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menú',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/ofrendas' as any)}
              style={{ marginRight: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Hazte socio</Text>
            </TouchableOpacity>
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

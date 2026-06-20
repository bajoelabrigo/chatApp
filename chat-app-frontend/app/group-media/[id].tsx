import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  ActivityIndicator, Linking, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/context/ThemeContext';
import { getMessages, type Message } from '../../src/services/conversationService';

function MediaItem({ msg, colors }: { msg: Message; colors: any }) {
  if (msg.type === 'image') {
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(msg.content)}
        style={{ flex: 1, margin: 2, aspectRatio: 1, backgroundColor: colors.bgSecondary }}
      >
        <Image source={{ uri: msg.content }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  const icon = msg.type === 'audio' ? '🎤' : '📎';
  const label = msg.type === 'audio'
    ? 'Nota de voz'
    : (msg.fileName ?? 'Documento');

  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(msg.content)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text style={{ fontSize: 22, marginRight: 12 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {new Date(msg.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted }}>›</Text>
    </TouchableOpacity>
  );
}

export default function GroupMediaScreen() {
  const { colors, isDark } = useTheme();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'images' | 'docs'>('images');

  useEffect(() => {
    if (!token) return;
    const loadAll = async () => {
      try {
        const batch = await getMessages(token, conversationId);
        setMessages(batch.filter((m) => m.type !== 'text'));
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [token, conversationId]);

  const images = messages.filter((m) => m.type === 'image');
  const docs = messages.filter((m) => m.type === 'document' || m.type === 'audio');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Archivos, enlaces y docs</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(['images', 'docs'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === tab ? colors.onlineDot : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '500', color: activeTab === tab ? colors.accent : colors.textSecondary }}>
              {tab === 'images' ? `📷 Imágenes (${images.length})` : `📎 Archivos (${docs.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : activeTab === 'images' ? (
        <FlatList
          data={images}
          keyExtractor={(item) => item._id}
          numColumns={3}
          renderItem={({ item }) => <MediaItem msg={item} colors={colors} />}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 48 }}>No hay imágenes compartidas</Text>
          }
        />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <MediaItem msg={item} colors={colors} />}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 48 }}>No hay archivos compartidos</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

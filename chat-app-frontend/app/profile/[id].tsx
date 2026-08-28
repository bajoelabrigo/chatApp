import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePostsStore } from '../../src/store/usePostsStore';
import { cld } from '../../src/lib/cldImage';
import { SocioTag } from '../../src/components/SocioTag';
import { getUserProfile, type ContactProfile } from '../../src/services/conversationService';
import { getPostsByUser } from '../../src/services/postService';
import { PostCard } from '../../src/components/comunidad/PostCard';
import { FriendButton } from '../../src/components/comunidad/FriendButton';
import { UserReelsGrid } from '../../src/components/comunidad/UserReelsGrid';

// Perfil de Comunidad de otro usuario — distinto de app/contact/[id].tsx, que
// es el panel de un contacto de chat (requiere conversationId, muestra
// grupos en común/silenciar/archivar). Este solo muestra lo social: bio,
// botón de amistad y sus publicaciones.
export default function CommunityProfileScreen() {
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const { userPosts, setUserPosts, upsertPost, removePost } = usePostsStore();

  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<'posts' | 'reels'>('posts');

  const posts = userPosts[userId] ?? [];
  const isSelf = userId === user?.id;

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const [profileData, postsData] = await Promise.all([
        getUserProfile(token, userId),
        getPostsByUser(token, userId),
      ]);
      setProfile(profileData);
      setUserPosts(userId, postsData);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Perfil</Text>
      </View>

      <FlatList
        // En la pestaña de reels la lista va vacía: la rejilla se pinta dentro
        // de la cabecera, que es lo que permite que TODO se desplace junto.
        data={pestana === 'posts' ? posts : []}
        keyExtractor={(p) => p._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => <PostCard post={item} onChange={upsertPost} onRemove={removePost} />}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            {profile.avatar ? (
              <Image source={{ uri: cld(profile.avatar, 96) }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontSize: 36, fontWeight: 'bold' }}>{profile.name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 'bold' }}>{profile.name}</Text>
              {profile.isSocio && <SocioTag size={14} />}
            </View>
            {!!profile.bio && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 6, paddingHorizontal: 24 }}>
                {profile.bio}
              </Text>
            )}
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
              {posts.length} publicaci{posts.length === 1 ? 'ón' : 'ones'}
            </Text>
            {!isSelf && (
              <View style={{ width: '100%', paddingHorizontal: 40, marginTop: 16 }}>
                <FriendButton userId={userId} />
              </View>
            )}

            {/* Publicaciones / Reels. Un reel es contenido permanente y hasta
                ahora no tenía ningún sitio propio: se perdía en cuanto salía
                del feed. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, width: '100%', paddingHorizontal: 16 }}>
              {([['posts', 'Publicaciones'], ['reels', 'Reels']] as const).map(([k, etiqueta]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setPestana(k)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                    backgroundColor: pestana === k ? colors.accent : colors.bgTertiary,
                  }}
                >
                  <Text style={{ color: pestana === k ? '#fff' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>
                    {etiqueta}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {pestana === 'reels' && token && (
              <View style={{ width: '100%', marginTop: 12 }}>
                <UserReelsGrid token={token} userId={userId} colors={colors} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          pestana === 'posts' ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>Sin publicaciones todavía.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

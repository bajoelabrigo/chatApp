import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePostsStore } from '../../src/store/usePostsStore';
import { getFeed, type Post } from '../../src/services/postService';
import { getConnectionRequests } from '../../src/services/connectionService';
import { PostCard } from '../../src/components/comunidad/PostCard';
import { StoriesRow } from '../../src/components/comunidad/StoriesRow';

const SCOPE_KEY = 'comunidad_feed_scope';
const LIMIT = 10;

type Scope = 'discover' | 'friends';

export default function ComunidadScreen() {
  const { colors } = useTheme();
  const { token } = useAuthStore();
  const { discoverFeed, friendsFeed, setFeed, appendFeed, upsertPost, removePost } = usePostsStore();

  const [scope, setScope] = useState<Scope>('discover');
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const posts = scope === 'discover' ? discoverFeed : friendsFeed;

  useEffect(() => {
    AsyncStorage.getItem(SCOPE_KEY).then((saved) => {
      if (saved === 'friends' || saved === 'discover') setScope(saved);
      setScopeLoaded(true);
    });
  }, []);

  const load = useCallback(async (targetScope: Scope) => {
    if (!token) return;
    try {
      const data = await getFeed(token, { scope: targetScope, page: 1, limit: LIMIT });
      setFeed(targetScope, data);
      setPage(1);
      setHasMore(data.length === LIMIT);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, setFeed]);

  useEffect(() => {
    if (!scopeLoaded) return;
    setLoading(true);
    load(scope);
  }, [scope, scopeLoaded, load]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getConnectionRequests(token).then((reqs) => setPendingCount(reqs.length)).catch(() => {});
    }, [token])
  );

  const changeScope = (next: Scope) => {
    if (next === scope) return;
    setScope(next);
    AsyncStorage.setItem(SCOPE_KEY, next).catch(() => {});
  };

  const loadMore = async () => {
    if (!token || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await getFeed(token, { scope, page: nextPage, limit: LIMIT });
      appendFeed(scope, data);
      setPage(nextPage);
      setHasMore(data.length === LIMIT);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load(scope);
  };

  const TabButton = ({ label, value }: { label: string; value: Scope }) => {
    const active = scope === value;
    return (
      <TouchableOpacity
        onPress={() => changeScope(value)}
        style={{
          flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999,
          backgroundColor: active ? colors.accent : 'transparent',
        }}
      >
        <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBg,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Comunidad</Text>
        <TouchableOpacity onPress={() => router.push('/comunidad/solicitudes' as any)} style={{ padding: 6, marginRight: 4 }}>
          <View>
            <Ionicons name="person-add-outline" size={22} color={colors.textPrimary} />
            {pendingCount > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
                backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/comunidad/create' as any)} style={{ padding: 6 }}>
          <Ionicons name="add-circle" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bgTertiary + '55' }}>
        <TabButton label="Descubrir" value="discover" />
        <TabButton label="Amigos" value="friends" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p._id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            <>
              {/* Historias (24 h) + acceso a Reels */}
              <StoriesRow />
              <TouchableOpacity
                onPress={() => router.push('/reels' as any)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  marginHorizontal: 14, marginBottom: 10,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 14, backgroundColor: colors.bgSecondary,
                  borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Ionicons name="play-circle" size={20} color={colors.accent} />
                <Text style={{ color: colors.textPrimary, fontWeight: '700', flex: 1 }}>Reels</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ver →</Text>
              </TouchableOpacity>
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Publicaciones</Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <PostCard post={item} onChange={upsertPost} onRemove={removePost} />
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }}>
                {scope === 'friends' ? 'Aún no tienes conexiones con publicaciones.' : 'Todavía no hay publicaciones.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePostsStore } from '../../src/store/usePostsStore';
import { cld } from '../../src/lib/cldImage';
import { timeAgo } from '../../src/utils/timeAgo';
import {
  getPostById, addComment, deleteComment, addReply, deleteReply, reactToComment, reactToReply,
  type Post, type PostComment,
} from '../../src/services/postService';
import { PostCard } from '../../src/components/comunidad/PostCard';
import { ReactionsBar, emojiPickerTheme } from '../../src/components/comunidad/reactions';

function Avatar({ uri, name, size, colors }: { uri?: string; name: string; size: number; colors: any }) {
  return uri ? (
    <Image source={{ uri: cld(uri, size) }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: size * 0.4 }}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token, user } = useAuthStore();
  const { upsertPost: upsertInStore, removePost: removeFromStore } = usePostsStore();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [reactTarget, setReactTarget] = useState<{ commentId: string; replyId?: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await getPostById(token, id);
      setPost(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la publicación');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  const syncPost = (updated: Post) => {
    setPost(updated);
    upsertInStore(updated);
  };

  const applyComments = (comments: PostComment[]) => {
    setPost((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, comments };
      upsertInStore(updated);
      return updated;
    });
  };

  const handleSend = async () => {
    if (!token || !post || !text.trim() || sending) return;
    setSending(true);
    try {
      const comments = replyTo
        ? await addReply(token, post._id, replyTo._id, { content: text.trim() })
        : await addComment(token, post._id, { content: text.trim() });
      applyComments(comments);
      setText('');
      setReplyTo(null);
    } catch {
      Alert.alert('Error', 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert('Eliminar comentario', '¿Eliminar este comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!token || !post) return;
          try { applyComments(await deleteComment(token, post._id, commentId)); }
          catch { Alert.alert('Error', 'No se pudo eliminar'); }
        },
      },
    ]);
  };

  const handleDeleteReply = (commentId: string, replyId: string) => {
    Alert.alert('Eliminar respuesta', '¿Eliminar esta respuesta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!token || !post) return;
          try { applyComments(await deleteReply(token, post._id, commentId, replyId)); }
          catch { Alert.alert('Error', 'No se pudo eliminar'); }
        },
      },
    ]);
  };

  const applyCommentReaction = async (commentId: string, replyId: string | undefined, emoji: string) => {
    if (!token || !post) return;
    try {
      const comments = replyId
        ? await reactToReply(token, post._id, commentId, replyId, emoji)
        : await reactToComment(token, post._id, commentId, emoji);
      applyComments(comments);
    } catch {
      Alert.alert('Error', 'No se pudo reaccionar');
    }
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const renderComment = ({ item: comment }: { item: PostComment }) => {
    const isOwner = comment.user._id === user?.id;
    return (
      <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => router.push(`/profile/${comment.user._id}` as any)}>
            <Avatar uri={comment.user.avatar} name={comment.user.name} size={34} colors={colors} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 14, padding: 10 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>{comment.user.name}</Text>
              {!!comment.content && <Text style={{ color: colors.textPrimary, fontSize: 14, marginTop: 2 }}>{comment.content}</Text>}
              {!!comment.image && (
                <Image source={{ uri: cld(comment.image, 220) }} style={{ width: 180, height: 180, borderRadius: 10, marginTop: 6 }} />
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, paddingHorizontal: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(comment.createdAt)}</Text>
              <TouchableOpacity onPress={() => setReactTarget({ commentId: comment._id })}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>Reaccionar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setReplyTo(comment); inputRef.current?.focus(); }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>Responder</Text>
              </TouchableOpacity>
              {isOwner && (
                <TouchableOpacity onPress={() => handleDeleteComment(comment._id)}>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '600' }}>Eliminar</Text>
                </TouchableOpacity>
              )}
            </View>
            <ReactionsBar
              reactions={comment.reactions}
              currentUserId={user?.id ?? ''}
              colors={colors}
              onReact={(emoji) => applyCommentReaction(comment._id, undefined, emoji)}
            />

            {comment.replies?.map((reply) => (
              <View key={reply._id} style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 14 }}>
                <TouchableOpacity onPress={() => router.push(`/profile/${reply.user._id}` as any)}>
                  <Avatar uri={reply.user.avatar} name={reply.user.name} size={28} colors={colors} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 12, padding: 8 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>{reply.user.name}</Text>
                    {!!reply.content && <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 2 }}>{reply.content}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingHorizontal: 6 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(reply.createdAt)}</Text>
                    <TouchableOpacity onPress={() => setReactTarget({ commentId: comment._id, replyId: reply._id })}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Reaccionar</Text>
                    </TouchableOpacity>
                    {reply.user._id === user?.id && (
                      <TouchableOpacity onPress={() => handleDeleteReply(comment._id, reply._id)}>
                        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '600' }}>Eliminar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ReactionsBar
                    reactions={reply.reactions}
                    currentUserId={user?.id ?? ''}
                    colors={colors}
                    onReact={(emoji) => applyCommentReaction(comment._id, reply._id, emoji)}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.headerBg,
        }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', flex: 1 }}>Publicación</Text>
        </View>

        <FlatList
          data={post.comments}
          keyExtractor={(c) => c._id}
          renderItem={renderComment}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <PostCard post={post} onChange={syncPost} onRemove={() => { removeFromStore(post._id); router.back(); }} truncate={false} />
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>Sé el primero en comentar.</Text>
          }
        />

        {replyTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.bgTertiary }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>Respondiendo a {replyTo.user.name}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: 16, paddingVertical: 10,
          borderTopWidth: 1, borderTopColor: colors.border,
          backgroundColor: colors.headerBg,
        }}>
          <View style={{ flex: 1, backgroundColor: colors.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? 'Escribe una respuesta…' : 'Escribe un comentario…'}
              placeholderTextColor={colors.inputPlaceholder}
              style={{ color: colors.inputText, fontSize: 14, maxHeight: 100 }}
              multiline
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
              opacity: text.trim() && !sending ? 1 : 0.5,
            }}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <EmojiPicker
        onEmojiSelected={(e: EmojiType) => {
          if (reactTarget) applyCommentReaction(reactTarget.commentId, reactTarget.replyId, e.emoji);
          setReactTarget(null);
        }}
        open={!!reactTarget}
        onClose={() => setReactTarget(null)}
        theme={emojiPickerTheme(colors)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />
    </SafeAreaView>
  );
}

import { create } from 'zustand';
import type { Post } from '../services/postService';

type Scope = 'discover' | 'friends';

// Caché en memoria del feed de Comunidad — a propósito SIN `persist`/AsyncStorage
// (a diferencia de chats/actividades): no hay requisito de verlo offline, y el
// feed cambia seguido, así que recargar al abrir es lo esperado.
interface PostsState {
  discoverFeed: Post[];
  friendsFeed: Post[];
  savedPosts: Post[];
  userPosts: Record<string, Post[]>;

  setFeed: (scope: Scope, posts: Post[]) => void;
  appendFeed: (scope: Scope, posts: Post[]) => void;
  setSavedPosts: (posts: Post[]) => void;
  setUserPosts: (userId: string, posts: Post[]) => void;
  upsertPost: (post: Post) => void;
  removePost: (postId: string) => void;
}

function replaceIn(list: Post[], post: Post): Post[] {
  return list.some((p) => p._id === post._id) ? list.map((p) => (p._id === post._id ? post : p)) : list;
}

function stripFrom(list: Post[], postId: string): Post[] {
  return list.filter((p) => p._id !== postId);
}

export const usePostsStore = create<PostsState>((set) => ({
  discoverFeed: [],
  friendsFeed: [],
  savedPosts: [],
  userPosts: {},

  setFeed: (scope, posts) =>
    set(scope === 'discover' ? { discoverFeed: posts } : { friendsFeed: posts }),

  appendFeed: (scope, posts) =>
    set((s) =>
      scope === 'discover'
        ? { discoverFeed: [...s.discoverFeed, ...posts] }
        : { friendsFeed: [...s.friendsFeed, ...posts] }
    ),

  setSavedPosts: (posts) => set({ savedPosts: posts }),

  setUserPosts: (userId, posts) =>
    set((s) => ({ userPosts: { ...s.userPosts, [userId]: posts } })),

  // Sincroniza feed/guardados/perfil sin refetch tras editar/reaccionar/comentar.
  upsertPost: (post) =>
    set((s) => ({
      discoverFeed: replaceIn(s.discoverFeed, post),
      friendsFeed: replaceIn(s.friendsFeed, post),
      savedPosts: replaceIn(s.savedPosts, post),
      userPosts: Object.fromEntries(
        Object.entries(s.userPosts).map(([uid, list]) => [uid, replaceIn(list, post)])
      ),
    })),

  removePost: (postId) =>
    set((s) => ({
      discoverFeed: stripFrom(s.discoverFeed, postId),
      friendsFeed: stripFrom(s.friendsFeed, postId),
      savedPosts: stripFrom(s.savedPosts, postId),
      userPosts: Object.fromEntries(
        Object.entries(s.userPosts).map(([uid, list]) => [uid, stripFrom(list, postId)])
      ),
    })),
}));

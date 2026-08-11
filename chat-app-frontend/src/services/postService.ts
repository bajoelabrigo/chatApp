import api from './authService';

export interface PostAuthor {
  _id: string;
  name: string;
  avatar?: string;
  bio?: string;
  role?: string;
  isSocio?: boolean;
}

export interface PostReactionUser {
  _id: string;
  name: string;
  avatar?: string;
}

export interface PostReaction {
  emoji: string;
  users: (string | PostReactionUser)[];
}

export interface PostReply {
  _id: string;
  content?: string;
  image?: string;
  user: PostAuthor;
  createdAt: string;
  reactions: PostReaction[];
}

export interface PostComment {
  _id: string;
  content?: string;
  image?: string;
  user: PostAuthor;
  createdAt: string;
  updatedAt?: string;
  reactions: PostReaction[];
  replies: PostReply[];
}

export interface PostLinkedVerse {
  book?: string;
  chapter?: number;
  verse?: number;
  text?: string;
}

export interface PostLinked {
  type?: 'activity' | 'plan' | 'prayer' | 'answered' | 'seminar' | 'material' | 'bible';
  refId?: string;
  groupId?: string;
  groupName?: string;
  groupImage?: string;
  title?: string;
  url?: string;
  text?: string;
  version?: string;
  verses?: PostLinkedVerse[];
}

export type AuthorRelation = 'self' | 'connected' | 'pending' | 'received' | 'not_connected';

export interface ShareCounts {
  facebook: number;
  messenger: number;
  twitter: number;
  telegram: number;
  whatsapp: number;
  pinterest: number;
  email: number;
  threads: number;
  linkedin: number;
  webshare: number;
}

export interface Post {
  _id: string;
  author: PostAuthor;
  content?: string;
  image?: string;
  likes: string[];
  sharedBy: string[];
  reactions: PostReaction[];
  comments: PostComment[];
  savedBy: string[];
  isRichText: boolean;
  linked?: PostLinked;
  shareCounts: ShareCounts;
  createdAt: string;
  updatedAt: string;
  isLiked: boolean;
  isSaved: boolean;
  authorRelation: AuthorRelation;
}

export interface PostEngagement {
  likers: PostReactionUser[];
  sharers: PostReactionUser[];
  reactions: PostReaction[];
  likeCount: number;
  reactionCount: number;
  shareCount: number;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getFeed(
  token: string,
  opts: { scope?: 'discover' | 'friends'; page?: number; limit?: number } = {}
): Promise<Post[]> {
  const { scope = 'discover', page = 1, limit = 10 } = opts;
  const { data } = await api.get<Post[]>('/posts', {
    ...h(token),
    params: { scope, page, limit },
  });
  return data;
}

export async function getSavedPosts(token: string, page = 1, limit = 10): Promise<Post[]> {
  const { data } = await api.get<Post[]>('/posts/saved', { ...h(token), params: { page, limit } });
  return data;
}

export async function getPostsByUser(token: string, userId: string, page = 1, limit = 10): Promise<Post[]> {
  const { data } = await api.get<Post[]>(`/posts/user/${userId}`, { ...h(token), params: { page, limit } });
  return data;
}

export async function getPostById(token: string, id: string): Promise<Post> {
  const { data } = await api.get<Post>(`/posts/${id}`, h(token));
  return data;
}

export async function getPostEngagement(token: string, id: string): Promise<PostEngagement> {
  const { data } = await api.get<PostEngagement>(`/posts/${id}/engagement`, h(token));
  return data;
}

export async function createPost(
  token: string,
  body: { content?: string; image?: string; linked?: { type: 'bible'; verses: PostLinkedVerse[]; version?: string } }
): Promise<Post> {
  const { data } = await api.post<Post>('/posts', body, h(token));
  return data;
}

export async function updatePost(token: string, id: string, content: string): Promise<{ postId: string; content: string }> {
  const { data } = await api.put(`/posts/${id}`, { content }, h(token));
  return data;
}

export async function deletePost(token: string, id: string): Promise<void> {
  await api.delete(`/posts/${id}`, h(token));
}

export async function likePost(token: string, id: string): Promise<{ likes: string[]; reactions: PostReaction[] }> {
  const { data } = await api.post(`/posts/${id}/like`, {}, h(token));
  return data;
}

export async function reactToPost(
  token: string,
  id: string,
  emoji: string
): Promise<{ likes: PostReactionUser[]; reactions: PostReaction[] }> {
  const { data } = await api.patch(`/posts/${id}/react`, { emoji }, h(token));
  return data;
}

export async function savePost(token: string, id: string): Promise<{ saved: boolean; savedCount: number }> {
  const { data } = await api.post(`/posts/${id}/save`, {}, h(token));
  return data;
}

export async function hidePost(token: string, id: string): Promise<void> {
  await api.post(`/posts/${id}/hide`, {}, h(token));
}

export async function sharePost(
  token: string,
  id: string,
  network: keyof ShareCounts
): Promise<{ success: boolean; shareCounts: ShareCounts; sharedCount: number }> {
  const { data } = await api.post(`/posts/${id}/share/${network}`, {}, h(token));
  return data;
}

export async function addComment(token: string, postId: string, body: { content?: string; image?: string }): Promise<PostComment[]> {
  const { data } = await api.post<PostComment[]>(`/posts/${postId}/comments`, body, h(token));
  return data;
}

export async function editComment(
  token: string,
  postId: string,
  commentId: string,
  body: { content?: string; image?: string }
): Promise<PostComment[]> {
  const { data } = await api.patch<PostComment[]>(`/posts/${postId}/comments/${commentId}`, body, h(token));
  return data;
}

export async function deleteComment(token: string, postId: string, commentId: string): Promise<PostComment[]> {
  const { data } = await api.delete<PostComment[]>(`/posts/${postId}/comments/${commentId}`, h(token));
  return data;
}

export async function addReply(
  token: string,
  postId: string,
  commentId: string,
  body: { content?: string; image?: string }
): Promise<PostComment[]> {
  const { data } = await api.post<PostComment[]>(`/posts/${postId}/comments/${commentId}/replies`, body, h(token));
  return data;
}

export async function deleteReply(token: string, postId: string, commentId: string, replyId: string): Promise<PostComment[]> {
  const { data } = await api.delete<PostComment[]>(`/posts/${postId}/comments/${commentId}/replies/${replyId}`, h(token));
  return data;
}

export async function reactToComment(token: string, postId: string, commentId: string, emoji: string): Promise<PostComment[]> {
  const { data } = await api.patch<PostComment[]>(`/posts/${postId}/comments/${commentId}/react`, { emoji }, h(token));
  return data;
}

export async function reactToReply(
  token: string,
  postId: string,
  commentId: string,
  replyId: string,
  emoji: string
): Promise<PostComment[]> {
  const { data } = await api.patch<PostComment[]>(`/posts/${postId}/comments/${commentId}/replies/${replyId}/react`, { emoji }, h(token));
  return data;
}

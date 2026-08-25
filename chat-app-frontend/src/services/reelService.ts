import api from './authService';

// Reels e Historias (cortos verticales ≤60 s, estilo Instagram).
export type ReelKind = 'reel' | 'story';

export interface ReelAuthor {
  id: string;
  name: string;
  avatar: string;
  isSocio: boolean;
}

export interface Reel {
  id: string;
  kind: ReelKind;
  caption: string;
  durationSeconds?: number;
  videoUrl: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  thumbUrl: string;
  author: ReelAuthor;
  createdAt: string;
  expiresAt: string | null;
  likeCount: number;
  viewCount: number;
  liked: boolean;
  viewed: boolean;
}

export interface YouTubeMeta {
  videoId: string;
  title: string;
  thumbUrl: string;
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

/** Feed de reels permanentes (paginado). */
export async function getReels(token: string, page = 1, limit = 10): Promise<Reel[]> {
  const { data } = await api.get<Reel[]>('/reels', {
    ...auth(token),
    params: { page, limit },
  });
  return data;
}

/** Historias activas (≤24 h), con el estado de vista del usuario actual. */
export async function getStories(token: string): Promise<Reel[]> {
  const { data } = await api.get<Reel[]>('/reels/stories', auth(token));
  return data;
}

export async function createReel(
  token: string,
  body: {
    kind: ReelKind;
    caption?: string;
    videoUrl?: string;
    cloudinaryPublicId?: string;
    youtubeUrl?: string;
    durationSeconds?: number;
  }
): Promise<Reel> {
  const { data } = await api.post<Reel>('/reels', body, auth(token));
  return data;
}

export async function toggleReelLike(token: string, id: string): Promise<{ liked: boolean; count: number }> {
  const { data } = await api.post<{ liked: boolean; count: number }>(`/reels/${id}/like`, {}, auth(token));
  return data;
}

export async function addReelView(token: string, id: string): Promise<{ viewed: boolean; viewCount: number }> {
  const { data } = await api.post<{ viewed: boolean; viewCount: number }>(`/reels/${id}/view`, {}, auth(token));
  return data;
}

export interface ReelViewer {
  userId: string;
  name: string;
  avatar?: string;
  at: string;
}

/** Quién vio mi historia (solo el autor). */
export async function getReelViewers(token: string, id: string): Promise<ReelViewer[]> {
  const { data } = await api.get<ReelViewer[]>(`/reels/${id}/views`, auth(token));
  return data;
}

export async function deleteReel(token: string, id: string): Promise<void> {
  await api.delete(`/reels/${id}`, auth(token));
}

/** Metadata de YouTube para el formulario (preview antes de publicar). */
export async function getYouTubeMeta(token: string, url: string): Promise<YouTubeMeta> {
  const { data } = await api.get<YouTubeMeta>('/reels/youtube-meta', {
    ...auth(token),
    params: { url },
  });
  return data;
}

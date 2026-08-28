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
  commentCount: number;
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

/** Reels e historias vivas de UNA persona, para su perfil. */
export async function getUserReels(
  token: string,
  userId: string,
  limit = 30
): Promise<{ reels: Reel[]; stories: Reel[] }> {
  const { data } = await api.get<{ reels: Reel[]; stories: Reel[] }>(`/reels/user/${userId}`, {
    ...auth(token),
    params: { limit },
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

/** Registra el compartido y avisa al autor. Idempotente: solo la primera vez. */
export async function registrarCompartido(token: string, id: string): Promise<void> {
  await api.post(`/reels/${id}/share`, {}, auth(token));
}

/** Denunciar un reel/historia. Idempotente: denunciar dos veces no suma. */
export async function reportReel(token: string, id: string, reason = ''): Promise<void> {
  await api.post(`/reels/${id}/report`, { reason }, auth(token));
}

/** Enlace a UN reel concreto, el que se ve. */
export function reelUrl(id: string): string {
  return `https://holyholyholy.es/reels?reel=${id}`;
}

/**
 * Enlace para COMPARTIR. Es el endpoint de Open Graph, no la ruta de la SPA:
 * los scrapers de WhatsApp y Facebook no ejecutan JS, así que del `/reels?reel=`
 * solo verían el index.html genérico (el logo y "Holy App"). Este le devuelve la
 * miniatura y el título al bot, y redirige a las personas a la SPA.
 */
export function reelShareUrl(id: string): string {
  return `https://holyholyholy.es/api/share/reel/${id}`;
}

export async function deleteReel(token: string, id: string): Promise<void> {
  await api.delete(`/reels/${id}`, auth(token));
}

export interface ReelReply {
  userId: string;
  name: string;
  avatar?: string;
  text: string;
  at: string;
}

export interface ReelComment {
  /** Falta en los comentarios anteriores al esquema con hilos: sin él no se
   *  puede responder (`scripts/reelCommentIds.mjs` se lo pone). */
  id?: string;
  userId: string;
  name: string;
  avatar?: string;
  text: string;
  at: string;
  replies?: ReelReply[];
}

/** `parentId`: responder a un comentario concreto en vez de al reel. */
export async function addReelComment(
  token: string,
  id: string,
  text: string,
  parentId?: string
): Promise<{ ok: boolean; commentCount: number }> {
  const { data } = await api.post(`/reels/${id}/comments`, { text, parentId }, auth(token));
  return data;
}

export async function getReelComments(token: string, id: string): Promise<ReelComment[]> {
  const { data } = await api.get<ReelComment[]>(`/reels/${id}/comments`, auth(token));
  return data;
}

/** Metadata de YouTube para el formulario (preview antes de publicar). */
export async function getYouTubeMeta(token: string, url: string): Promise<YouTubeMeta> {
  const { data } = await api.get<YouTubeMeta>('/reels/youtube-meta', {
    ...auth(token),
    params: { url },
  });
  return data;
}

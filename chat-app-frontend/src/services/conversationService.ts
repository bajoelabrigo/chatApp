import api from './authService';

export interface ChatUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'call' | 'contact' | 'poll';

export interface MessageReplyTo {
  messageId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: MessageType;
  fileName?: string;
}

/** Contacto compartido (mensaje `type: 'contact'`): snapshot + id para abrir el chat. */
export interface SharedContact {
  userId: string;
  name: string;
  avatar?: string;
}

export interface Reaction {
  emoji: string;
  users: string[];
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: ChatUser;
  content: string;
  type: MessageType;
  fileName?: string;
  fileSize?: number;
  status: 'sent' | 'delivered' | 'read';
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  editedAt?: string;
  callStatus?: 'missed' | 'answered';
  callType?: 'audio' | 'video';
  callDuration?: number;
  contact?: SharedContact;
  /** Encuesta (`type: 'poll'`). Los votos van dentro de cada opción. */
  poll?: {
    question: string;
    options: { text: string; votes: string[] }[];
    multiple: boolean;
    closed: boolean;
  };
  replyTo?: MessageReplyTo;
  reactions?: Reaction[];
  createdAt: string;
}

export interface GroupPermissions {
  membersCanSend: boolean;
  membersCanAddMembers: boolean;
  membersCanInvite: boolean;
  requireAdminApproval: boolean;
}

export interface Conversation {
  _id: string;
  participants: ChatUser[];
  lastMessage?: Message;
  lastMessageAt?: string;
  createdAt: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  // Marcado como no leído a mano (sin mensajes pendientes de verdad).
  isUnreadMarked?: boolean;
  unreadCount?: number;
  // Group
  isGroup?: boolean;
  groupName?: string;
  groupAvatar?: string;
  admins?: string[];
  permissions?: GroupPermissions;
  tempMessageDuration?: number | null;
}

export async function getConversations(token: string): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/conversations', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function markAllConversationsRead(token: string): Promise<void> {
  await api.patch('/conversations/mark-all-read', {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createOrGetConversation(token: string, targetUserId: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>(
    '/conversations',
    { targetUserId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function getMessages(
  token: string,
  conversationId: string,
  before?: string
): Promise<Message[]> {
  const params = before ? { before } : {};
  const { data } = await api.get<Message[]>(`/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return data;
}

export async function searchUsers(token: string, q: string): Promise<ChatUser[]> {
  const { data } = await api.get<ChatUser[]>('/conversations/users/search', {
    headers: { Authorization: `Bearer ${token}` },
    params: { q },
  });
  return data;
}

// Una coincidencia de la búsqueda global de mensajes (estilo WhatsApp): el mensaje
// encontrado + el remitente + datos de la conversación a la que pertenece.
export interface MessageSearchHit {
  _id: string;
  conversationId: string;
  content?: string;
  type: string;
  fileName?: string;
  createdAt: string;
  senderName?: string;
  conversation: {
    _id: string;
    isGroup: boolean;
    name: string;
    avatar?: string;
  } | null;
}

// Búsqueda global por contenido de mensajes. Devuelve cada mensaje coincidente con
// su snippet y conversación (para mostrar resultados estilo WhatsApp y navegar al
// mensaje exacto).
export async function searchAllMessages(token: string, q: string): Promise<MessageSearchHit[]> {
  const { data } = await api.get<{ results: MessageSearchHit[] }>(
    '/conversations/search/messages',
    { headers: { Authorization: `Bearer ${token}` }, params: { q } }
  );
  return data.results ?? [];
}

// Variante que devuelve solo los IDs de conversación con coincidencias (para el
// filtro de la lista de chats por palabra, no solo por nombre).
export async function searchMessageConversations(token: string, q: string): Promise<string[]> {
  const results = await searchAllMessages(token, q);
  return Array.from(new Set(results.map((r) => r.conversationId)));
}

export async function getSuggestedUsers(token: string): Promise<ChatUser[]> {
  const { data } = await api.get<ChatUser[]>('/conversations/users/suggested', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function getAllUsers(token: string, q?: string): Promise<ChatUser[]> {
  const { data } = await api.get<ChatUser[]>('/conversations/users/all', {
    headers: { Authorization: `Bearer ${token}` },
    params: q ? { q } : {},
  });
  return data;
}

export async function getArchivedConversations(token: string): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/conversations', {
    headers: { Authorization: `Bearer ${token}` },
    params: { archived: 'true' },
  });
  return data;
}

export async function getFavoriteConversations(token: string): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/conversations', {
    headers: { Authorization: `Bearer ${token}` },
    params: { favorite: 'true' },
  });
  return data;
}

export interface BlockedUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

export async function getBlockedUsers(token: string): Promise<BlockedUser[]> {
  const { data } = await api.get<BlockedUser[]>('/users/blocked', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function apiTogglePin(token: string, conversationId: string) {
  const { data } = await api.patch(`/conversations/${conversationId}/pin`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { pinned: boolean };
}

export async function apiToggleArchive(token: string, conversationId: string) {
  const { data } = await api.patch(`/conversations/${conversationId}/archive`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { archived: boolean };
}

export async function apiToggleFavorite(token: string, conversationId: string) {
  const { data } = await api.patch(`/conversations/${conversationId}/favorite`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { favorited: boolean };
}

// Marcar/desmarcar el chat como no leído. `unread: false` además marca como
// leídos los mensajes pendientes de verdad (equivale a abrir el chat).
export async function apiSetUnread(token: string, conversationId: string, unread: boolean) {
  const { data } = await api.patch(`/conversations/${conversationId}/unread`, { unread }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { unread: boolean };
}

// Vacía el chat solo para mí (la conversación sigue en la lista, sin mensajes).
export async function apiClearConversation(token: string, conversationId: string) {
  const { data } = await api.delete(`/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { cleared: number };
}

// Elimina el chat solo para mí: lo vacía y lo saca de mi lista. Si el otro vuelve
// a escribir, reaparece. En grupos el backend responde 400 (hay que salir primero).
export async function apiDeleteConversation(token: string, conversationId: string) {
  const { data } = await api.delete(`/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { deleted: boolean };
}

export async function apiToggleMute(token: string, conversationId: string) {
  const { data } = await api.patch(`/conversations/${conversationId}/mute`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { muted: boolean };
}

export async function apiToggleBlock(token: string, targetUserId: string) {
  const { data } = await api.patch(`/users/block/${targetUserId}`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { blocked: boolean };
}

export interface CreateGroupParams {
  name: string;
  participantIds: string[];
  permissions: GroupPermissions;
  tempMessageDuration: number | null;
}

export async function createGroup(token: string, params: CreateGroupParams): Promise<Conversation> {
  const { data } = await api.post<Conversation>('/groups', params, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateGroup(
  token: string,
  groupId: string,
  params: Partial<{ name: string; permissions: Partial<GroupPermissions>; tempMessageDuration: number | null }>
): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/groups/${groupId}`, params, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function addGroupMembers(token: string, groupId: string, memberIds: string[]) {
  const { data } = await api.post(`/groups/${groupId}/members`, { memberIds }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export async function removeGroupMember(token: string, groupId: string, memberId: string) {
  const { data } = await api.delete(`/groups/${groupId}/members/${memberId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export interface GroupInfo extends Conversation {
  isAdmin: boolean;
}

export async function getGroupInfo(token: string, groupId: string): Promise<GroupInfo> {
  const { data } = await api.get<GroupInfo>(`/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// Media compartida del grupo para el panel "Archivos, enlaces y docs".
// El backend (`GET /groups/:id/media`) devuelve tres listas ya separadas:
//  - files: fotos/videos/audios (type image|audio)
//  - links: URLs encontradas en mensajes de texto
//  - docs:  documentos (type document)
export interface GroupMediaFile {
  _id: string;
  url: string;
  type: 'image' | 'audio' | 'document';
  fileName?: string;
  fileSize?: number;
  createdAt: string;
}
export interface GroupMediaLink {
  _id: string;
  url: string;
  createdAt: string;
}
export interface GroupMedia {
  files: GroupMediaFile[];
  links: GroupMediaLink[];
  docs: GroupMediaFile[];
}

export async function getGroupMedia(token: string, groupId: string): Promise<GroupMedia> {
  const { data } = await api.get<GroupMedia>(`/groups/${groupId}/media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    files: data.files ?? [],
    links: data.links ?? [],
    docs: data.docs ?? [],
  };
}

export async function toggleGroupAdmin(token: string, groupId: string, memberId: string): Promise<{ isAdmin: boolean }> {
  const { data } = await api.patch(`/groups/${groupId}/members/${memberId}/admin`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { isAdmin: boolean };
}

export async function deleteGroup(token: string, groupId: string) {
  const { data } = await api.delete(`/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

// Grupos que puedo encontrar y a los que puedo pedir unirme.
//
// Solo salen los que su admin marcó como visibles, y nunca los míos. La
// maquinaria para ENTRAR (solicitud + aprobación) ya existía; lo que faltaba era
// poder descubrirlos: hasta ahora solo se entraba si un admin te metía o si
// alguien te pasaba un enlace.
export interface DiscoverableGroup {
  _id: string;
  groupName: string;
  groupAvatar: string | null;
  groupDescription: string;
  memberCount: number;
  requiresApproval: boolean;
  /** Ya pedí entrar y espero al admin: el botón debe decirlo, no invitar otra vez. */
  requestPending: boolean;
}

export async function discoverGroups(token: string, q = ''): Promise<DiscoverableGroup[]> {
  try {
    const { data } = await api.get<DiscoverableGroup[]>('/groups/discover', {
      headers: { Authorization: `Bearer ${token}` },
      params: q ? { q } : {},
    });
    return data;
  } catch {
    // Sin conexión (o backend viejo): la lista de chats debe abrirse igual.
    return [];
  }
}

// Unirse a un grupo mediante un enlace compartido (chatapp://g/:id).
// - Grupo abierto: devuelve la conversación (+ alreadyMember).
// - Grupo con aprobación previa: devuelve { pending: true, ... }.
export async function joinGroup(token: string, groupId: string) {
  const { data } = await api.post(`/groups/${groupId}/join`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as
    | (Conversation & { alreadyMember?: boolean })
    | { pending: true; alreadyPending?: boolean; groupName?: string };
}

export interface PendingMember {
  _id: string;
  name: string;
  avatar?: string;
  email?: string;
  requestedAt: string;
}

// Solicitudes de ingreso pendientes de un grupo (solo admins).
export async function getPendingMembers(token: string, groupId: string) {
  const { data } = await api.get(`/groups/${groupId}/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as PendingMember[];
}

export async function approvePendingMember(token: string, groupId: string, memberId: string) {
  const { data } = await api.post(`/groups/${groupId}/pending/${memberId}/approve`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export async function rejectPendingMember(token: string, groupId: string, memberId: string) {
  const { data } = await api.post(`/groups/${groupId}/pending/${memberId}/reject`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export async function leaveGroup(token: string, groupId: string) {
  const { data } = await api.post(`/groups/${groupId}/leave`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export async function reportGroup(token: string, groupId: string, reason: string) {
  const { data } = await api.post(`/groups/${groupId}/report`, { reason }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

export interface ContactProfile {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  role?: string;
  sharedGroups: {
    _id: string;
    groupName?: string;
    groupAvatar?: string;
    participantCount: number;
  }[];
  isBlocked: boolean;
}

export async function getUserProfile(token: string, userId: string): Promise<ContactProfile> {
  const { data } = await api.get<ContactProfile>(`/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// Seguidores + conexiones del usuario (para sugerir al crear un grupo).
export async function getMyConnections(token: string): Promise<ChatUser[]> {
  const { data } = await api.get<ChatUser[]>('/users/me/connections', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function reportUser(token: string, userId: string, reason: string) {
  const { data } = await api.post(`/users/${userId}/report`, { reason }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as { ok: boolean };
}

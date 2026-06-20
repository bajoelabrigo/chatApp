import api from './authService';

export interface ChatUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface MessageReplyTo {
  messageId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'call';
  fileName?: string;
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
  type: 'text' | 'image' | 'audio' | 'document' | 'call';
  fileName?: string;
  fileSize?: number;
  status: 'sent' | 'delivered' | 'read';
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  editedAt?: string;
  callStatus?: 'missed' | 'answered';
  callType?: 'audio' | 'video';
  callDuration?: number;
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

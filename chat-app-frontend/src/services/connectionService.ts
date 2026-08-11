import api from './authService';
import type { AuthorRelation } from './postService';

export interface ConnectionUser {
  _id: string;
  name: string;
  avatar?: string;
  bio?: string;
}

export interface ConnectionRequestItem {
  _id: string;
  sender: ConnectionUser;
  recipient: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ConnectionStatus {
  status: AuthorRelation;
  requestId?: string;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function sendConnectionRequest(token: string, userId: string): Promise<{ message: string; requestId: string }> {
  const { data } = await api.post(`/connections/request/${userId}`, {}, h(token));
  return data;
}

export async function acceptConnectionRequest(token: string, requestId: string): Promise<{ message: string }> {
  const { data } = await api.put(`/connections/accept/${requestId}`, {}, h(token));
  return data;
}

export async function rejectConnectionRequest(token: string, requestId: string): Promise<{ message: string }> {
  const { data } = await api.put(`/connections/reject/${requestId}`, {}, h(token));
  return data;
}

export async function cancelConnectionRequest(token: string, requestId: string): Promise<{ message: string }> {
  const { data } = await api.delete(`/connections/request/${requestId}`, h(token));
  return data;
}

export async function getConnectionRequests(token: string): Promise<ConnectionRequestItem[]> {
  const { data } = await api.get<ConnectionRequestItem[]>('/connections/request', h(token));
  return data;
}

export async function getConnectionStatus(token: string, userId: string): Promise<ConnectionStatus> {
  const { data } = await api.get<ConnectionStatus>(`/connections/status/${userId}`, h(token));
  return data;
}

export async function getConnections(token: string): Promise<ConnectionUser[]> {
  const { data } = await api.get<ConnectionUser[]>('/connections', h(token));
  return data;
}

export async function removeConnection(token: string, userId: string): Promise<{ message: string }> {
  const { data } = await api.delete(`/connections/${userId}`, h(token));
  return data;
}

export async function followUser(token: string, userId: string): Promise<{ following: boolean }> {
  const { data } = await api.post(`/users/follow/${userId}`, {}, h(token));
  return data;
}

export async function unfollowUser(token: string, userId: string): Promise<{ following: boolean }> {
  const { data } = await api.post(`/users/unfollow/${userId}`, {}, h(token));
  return data;
}

export async function getFollowStatus(token: string, userId: string): Promise<{ following: boolean }> {
  const { data } = await api.get(`/users/follow/status/${userId}`, h(token));
  return data;
}

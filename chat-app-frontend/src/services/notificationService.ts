import api from './authService';

export type NotificationKind =
  | 'chat'
  | 'missed_call'
  | 'prayer'
  | 'prayer_pray'
  | 'activity'
  | 'reminder'
  | 'material';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timestamp: string;
  isNew: boolean;
  isRead?: boolean;
  avatar?: string;
  emoji?: string;
  nav: { screen: 'chat' | 'prayer' | 'activities' | 'activities-tab' | 'material'; id: string };
  data?: { unreadCount?: number; callType?: 'audio' | 'video'; prayingCount?: number };
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getNotifications(token: string): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>('/notifications', h(token));
  return data;
}

export async function markNotificationsSeen(token: string): Promise<void> {
  await api.post('/notifications/seen', {}, h(token));
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  await api.post('/notifications/read', { id }, h(token));
}

export async function dismissNotification(token: string, id: string): Promise<void> {
  await api.post('/notifications/dismiss', { id }, h(token));
}

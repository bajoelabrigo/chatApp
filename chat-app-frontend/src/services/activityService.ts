import api from './authService';

export type ActivityType = 'ayuno' | 'vigilia' | 'cilicio' | 'escala_oracion' | 'bible_reading' | 'evangelism' | 'prayer' | 'fasting';

export interface CommitmentDetail {
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  proposito?: string;
  notificationsEnabled: boolean;
}

export interface GroupActivity {
  _id: string;
  groupId: string;
  createdBy: string;
  type: ActivityType;
  emoji: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  committedCount?: number;
  myCommitment?: CommitmentDetail | null;
  createdAt: string;
}

export interface ActivityCommitment {
  _id: string;
  activityId: { _id: string; name: string; emoji: string; type: ActivityType } | string;
  groupId: { _id: string; groupName: string } | string;
  userId: string;
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
  timezone: string;
  isActive: boolean;
}

export interface ActivityParticipant {
  _id: string;
  userId: { _id: string; name: string; avatar?: string };
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
  timezone: string;
}

export interface PrayingUser {
  userId: { _id: string; name: string; avatar?: string };
  prayedAt: string;
  message?: string;
}

export interface PrayerRequest {
  _id: string;
  groupId: string;
  authorId: { _id: string; name: string; avatar?: string } | null;
  content: string;
  isAnonymous: boolean;
  imageUrl?: string;
  cloudinaryPublicId?: string;
  deadline?: string;
  prayingCount: number;
  isPraying: boolean;
  isMyRequest: boolean;
  isAnswered: boolean;
  answeredAt?: string;
  answeredNote?: string;
  prayingUsers: PrayingUser[];
  createdAt: string;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getGroupActivities(token: string, groupId: string): Promise<GroupActivity[]> {
  const { data } = await api.get<GroupActivity[]>(`/groups/${groupId}/activities`, h(token));
  return data;
}

export async function createActivity(
  token: string,
  groupId: string,
  payload: { type: ActivityType; name?: string; description?: string; startDate?: string; endDate?: string }
): Promise<GroupActivity> {
  const { data } = await api.post<GroupActivity>(`/groups/${groupId}/activities`, payload, h(token));
  return data;
}

export async function updateActivity(
  token: string,
  groupId: string,
  activityId: string,
  payload: { name?: string; description?: string; isActive?: boolean; type?: ActivityType; startDate?: string; endDate?: string }
): Promise<GroupActivity> {
  const { data } = await api.patch<GroupActivity>(`/groups/${groupId}/activities/${activityId}`, payload, h(token));
  return data;
}

export async function deleteActivity(token: string, groupId: string, activityId: string): Promise<void> {
  await api.delete(`/groups/${groupId}/activities/${activityId}`, h(token));
}

export async function commitToActivity(
  token: string,
  groupId: string,
  activityId: string,
  payload: {
    proposito?: string;
    daysOfWeek: number[];
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    notificationsEnabled: boolean;
    timezone: string;
    expoPushToken?: string;
  }
): Promise<ActivityCommitment> {
  const { data } = await api.post<ActivityCommitment>(
    `/groups/${groupId}/activities/${activityId}/commit`,
    payload,
    h(token)
  );
  return data;
}

export async function cancelCommitment(token: string, groupId: string, activityId: string): Promise<void> {
  await api.delete(`/groups/${groupId}/activities/${activityId}/commit`, h(token));
}

export async function getActivityCommitments(token: string, groupId: string, activityId: string): Promise<ActivityParticipant[]> {
  const { data } = await api.get<ActivityParticipant[]>(`/groups/${groupId}/activities/${activityId}/commitments`, h(token));
  return data;
}

export async function getMyCommitments(token: string, groupId?: string): Promise<ActivityCommitment[]> {
  const url = groupId
    ? `/groups/${groupId}/activities/my-commitments`
    : '/users/my-commitments';
  const { data } = await api.get<ActivityCommitment[]>(url, h(token));
  return data;
}

export async function getPrayerRequests(
  token: string,
  groupId: string,
  answered = false
): Promise<PrayerRequest[]> {
  const { data } = await api.get<PrayerRequest[]>(
    `/groups/${groupId}/prayer-requests`,
    { ...h(token), params: { answered } }
  );
  return data;
}

export async function createPrayerRequest(
  token: string,
  groupId: string,
  content: string,
  isAnonymous: boolean,
  imageUrl?: string,
  cloudinaryPublicId?: string,
  deadline?: string
): Promise<PrayerRequest> {
  const { data } = await api.post<PrayerRequest>(
    `/groups/${groupId}/prayer-requests`,
    { content, isAnonymous, imageUrl, cloudinaryPublicId, deadline },
    h(token)
  );
  return data;
}

export async function deletePrayerRequest(token: string, groupId: string, requestId: string): Promise<void> {
  await api.delete(`/groups/${groupId}/prayer-requests/${requestId}`, h(token));
}

export async function togglePray(
  token: string,
  groupId: string,
  requestId: string,
  message?: string
): Promise<{ prayingCount: number; isPraying: boolean; prayingUsers: PrayingUser[] }> {
  const { data } = await api.post(
    `/groups/${groupId}/prayer-requests/${requestId}/pray`,
    { message },
    h(token)
  );
  return data;
}

export interface EditPrayerPayload {
  content: string;
  isAnonymous?: boolean;
  // null para quitar la foto/fecha; undefined para no tocarla.
  imageUrl?: string | null;
  cloudinaryPublicId?: string;
  deadline?: string | null;
}

export async function editPrayerRequest(
  token: string,
  groupId: string,
  requestId: string,
  payload: string | EditPrayerPayload
): Promise<PrayerRequest> {
  const body = typeof payload === 'string' ? { content: payload } : payload;
  const { data } = await api.patch<PrayerRequest>(
    `/groups/${groupId}/prayer-requests/${requestId}`,
    body,
    h(token)
  );
  return data;
}

export interface MyPrayingRequest {
  _id: string;
  groupId: { _id: string; groupName: string };
  authorId: { _id: string; name: string; avatar?: string } | null;
  content: string;
  isAnonymous: boolean;
  imageUrl?: string;
  deadline?: string;
  createdAt: string;
  prayingCount: number;
}

export async function getMyPrayingRequests(token: string): Promise<MyPrayingRequest[]> {
  const { data } = await api.get<MyPrayingRequest[]>('/users/me/prayer-requests', h(token));
  return data;
}

export async function markAnswered(
  token: string,
  groupId: string,
  requestId: string,
  answeredNote?: string
): Promise<PrayerRequest> {
  const { data } = await api.patch<PrayerRequest>(
    `/groups/${groupId}/prayer-requests/${requestId}/answer`,
    { answeredNote },
    h(token)
  );
  return data;
}

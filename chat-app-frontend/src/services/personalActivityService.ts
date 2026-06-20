import api from './authService';
import type { ActivityType } from './activityService';

export interface PersonalCommitment {
  _id: string;
  type: ActivityType;
  emoji: string;
  name: string;
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

export type PersonalCommitmentPayload = {
  type: ActivityType;
  name?: string;
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
};

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getMyPersonalActivities(token: string): Promise<PersonalCommitment[]> {
  const { data } = await api.get<PersonalCommitment[]>('/users/me/activities', h(token));
  return data;
}

export async function createPersonalActivity(token: string, payload: PersonalCommitmentPayload): Promise<PersonalCommitment> {
  const { data } = await api.post<PersonalCommitment>('/users/me/activities', payload, h(token));
  return data;
}

export async function updatePersonalActivity(
  token: string,
  id: string,
  payload: Partial<Omit<PersonalCommitmentPayload, 'type'>>
): Promise<PersonalCommitment> {
  const { data } = await api.patch<PersonalCommitment>(`/users/me/activities/${id}`, payload, h(token));
  return data;
}

export async function deletePersonalActivity(token: string, id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete<{ ok: boolean }>(`/users/me/activities/${id}`, h(token));
  return data;
}

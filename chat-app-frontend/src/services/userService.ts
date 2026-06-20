import api from './authService';
import type { NotificationSettings, PrivacySettings } from '../store/useAuthStore';

export interface MyProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio: string;
  authProvider?: 'google' | 'email';
  createdAt: string;
}

export interface UserSettings {
  notificationSettings: NotificationSettings;
  privacySettings: PrivacySettings;
}

export async function getMyProfileApi(token: string): Promise<MyProfile> {
  const { data } = await api.get<MyProfile>('/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateProfileApi(
  token: string,
  updates: { name?: string; bio?: string; avatar?: string }
): Promise<MyProfile> {
  const { data } = await api.patch<MyProfile>('/users/me', updates, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function getSettingsApi(token: string): Promise<UserSettings> {
  const { data } = await api.get<UserSettings>('/users/me/settings', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateSettingsApi(
  token: string,
  updates: {
    notificationSettings?: Partial<NotificationSettings>;
    privacySettings?: Partial<PrivacySettings>;
  }
): Promise<UserSettings> {
  const { data } = await api.patch<UserSettings>('/users/me/settings', updates, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function changePasswordApi(
  token: string,
  payload: { currentPassword: string; newPassword: string }
): Promise<void> {
  await api.patch('/users/me/password', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteAccountApi(token: string): Promise<void> {
  await api.delete('/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

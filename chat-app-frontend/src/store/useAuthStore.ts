import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface NotificationSettings {
  messages: boolean;
  prayerRequests: boolean;
  activityReminders: boolean;
}

export interface PrivacySettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  showLastSeen: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  authProvider?: 'google' | 'email';
  notificationSettings?: NotificationSettings;
  privacySettings?: PrivacySettings;
}

interface AuthState {
  isSignedIn: boolean;
  user: AuthUser | null;
  token: string | null;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => Promise<void>;
  loadToken: () => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isSignedIn: false,
  user: null,
  token: null,

  setAuth: async (token, refreshToken, user) => {
    await Promise.all([
      SecureStore.setItemAsync('token', token),
      SecureStore.setItemAsync('refreshToken', refreshToken),
      SecureStore.setItemAsync('user', JSON.stringify(user)),
    ]);
    set({ isSignedIn: true, token, user });
  },

  updateUser: async (updates) => {
    const current = useAuthStore.getState().user;
    if (!current) return;
    const merged = { ...current, ...updates };
    await SecureStore.setItemAsync('user', JSON.stringify(merged));
    set({ user: merged });
  },

  loadToken: async () => {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync('token'),
      SecureStore.getItemAsync('user'),
    ]);
    if (token) {
      const user: AuthUser | null = userJson ? JSON.parse(userJson) : null;
      set({ isSignedIn: true, token, user });
      return true;
    }
    return false;
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('token'),
      SecureStore.deleteItemAsync('refreshToken'),
      SecureStore.deleteItemAsync('user'),
    ]);
    set({ isSignedIn: false, user: null, token: null });
  },
}));

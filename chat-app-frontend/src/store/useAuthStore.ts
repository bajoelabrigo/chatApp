import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface NotificationSettings {
  messages: boolean;
  prayerRequests: boolean;
  activityReminders: boolean;
  // Versículo del día (#8): push diario a las 8:00 hora local. Activo por defecto.
  dailyVerse?: boolean;
  // Directos ("Fulano está en vivo 🔴"). Activo por defecto.
  live?: boolean;
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
  // Sin verificar ya no impide entrar (antes el login respondía 403): la app
  // deja pasar y enseña un aviso en Ajustes con un botón para reenviar el
  // código. Puede faltar en sesiones guardadas por versiones anteriores.
  emailVerified?: boolean;
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

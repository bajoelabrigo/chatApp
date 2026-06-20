import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
});

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function drainQueue(err: unknown, token: string | null) {
  pendingQueue.forEach((p) => (err ? p.reject(err) : p.resolve(token!)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers['Authorization'] = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!refreshToken) throw new Error('no_refresh_token');

      const { data } = await axios.post<{ token: string }>(
        `${process.env.EXPO_PUBLIC_API_URL}/auth/refresh`,
        { refreshToken }
      );

      const newToken = data.token;
      await SecureStore.setItemAsync('token', newToken);

      // Update Zustand store in-memory token without importing (avoids circular deps)
      const { useAuthStore } = require('../store/useAuthStore');
      useAuthStore.setState({ token: newToken });

      drainQueue(null, newToken);
      original.headers['Authorization'] = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(refreshErr, null);
      // Refresh failed — clear session so the app redirects to login
      await SecureStore.deleteItemAsync('token').catch(() => {});
      await SecureStore.deleteItemAsync('refreshToken').catch(() => {});
      await SecureStore.deleteItemAsync('user').catch(() => {});
      const { useAuthStore } = require('../store/useAuthStore');
      useAuthStore.setState({ isSignedIn: false, token: null, user: null });
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; avatar?: string };
}

export async function googleSignInApi(idToken: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/google-signin', { idToken });
  return data;
}

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function registerApi(name: string, email: string, password: string): Promise<{ email: string }> {
  const { data } = await api.post('/auth/register', { name, email, password });
  return data;
}

export async function verifyEmailApi(email: string, code: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/verify-email', { email, code });
  return data;
}

export async function resendCodeApi(email: string): Promise<void> {
  await api.post('/auth/resend-code', { email });
}

export async function forgotPasswordApi(email: string): Promise<{ email: string; sent: boolean }> {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPasswordApi(email: string, code: string, password: string): Promise<void> {
  await api.post('/auth/reset-password', { email, code, password });
}

export async function refreshTokenApi(refreshToken: string): Promise<{ token: string }> {
  const { data } = await api.post<{ token: string }>('/auth/refresh', { refreshToken });
  return data;
}

export default api;

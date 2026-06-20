import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNotifications,
  markNotificationsSeen,
  markNotificationRead,
  dismissNotification,
  type NotificationItem,
} from '../services/notificationService';

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;

  fetchNotifications: (token: string) => Promise<void>;
  markSeen: (token: string) => Promise<void>;
  markRead: (token: string, id: string) => Promise<void>;
  dismiss: (token: string, id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      unreadCount: 0,
      loading: false,

      fetchNotifications: async (token) => {
        set({ loading: true });
        try {
          const { items, unreadCount } = await getNotifications(token);
          set({ items, unreadCount });
        } catch {
          // mantener datos cacheados si falla la red
        } finally {
          set({ loading: false });
        }
      },

      markSeen: async (token) => {
        // Limpieza optimista del badge (el servidor guarda lastNotificationsSeen).
        // Se conserva el resaltado `isNew` de los items durante esta sesión de
        // visualización; se recalcula a false en el próximo fetch.
        set({ unreadCount: 0 });
        try {
          await markNotificationsSeen(token);
        } catch {
          // sin conexión: el badge se recalcula en el próximo fetch
        }
      },

      markRead: async (token, id) => {
        // Optimista: marcar como leído y descontar del badge.
        set((state) => {
          let delta = 0;
          const items = state.items.map((it) => {
            if (it.id !== id || it.isRead) return it;
            if (it.kind !== 'reminder') {
              delta += it.kind === 'chat' ? it.data?.unreadCount ?? 1 : it.isNew ? 1 : 0;
            }
            return { ...it, isRead: true, isNew: false };
          });
          return { items, unreadCount: Math.max(0, state.unreadCount - delta) };
        });
        try {
          await markNotificationRead(token, id);
        } catch {
          // se reconcilia en el próximo fetch
        }
      },

      dismiss: async (token, id) => {
        // Optimista: quitar el item y descontar del badge.
        set((state) => {
          const removed = state.items.find((it) => it.id === id);
          let delta = 0;
          if (removed && !removed.isRead && removed.kind !== 'reminder') {
            delta = removed.kind === 'chat' ? removed.data?.unreadCount ?? 1 : removed.isNew ? 1 : 0;
          }
          return {
            items: state.items.filter((it) => it.id !== id),
            unreadCount: Math.max(0, state.unreadCount - delta),
          };
        });
        try {
          await dismissNotification(token, id);
        } catch {
          // se reconcilia en el próximo fetch
        }
      },
    }),
    {
      name: 'notifications-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items, unreadCount: state.unreadCount }),
    }
  )
);

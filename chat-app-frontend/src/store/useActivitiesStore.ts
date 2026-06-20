import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket } from '../services/socketService';
import type { GroupActivity, ActivityCommitment, PrayerRequest } from '../services/activityService';

interface ActivitiesState {
  activities: Record<string, GroupActivity[]>;
  myCommitments: ActivityCommitment[];
  prayerRequests: Record<string, PrayerRequest[]>;

  setActivities: (groupId: string, activities: GroupActivity[]) => void;
  setMyCommitments: (commitments: ActivityCommitment[]) => void;
  setPrayerRequests: (groupId: string, requests: PrayerRequest[]) => void;
  upsertPrayerRequest: (groupId: string, request: PrayerRequest) => void;
  updatePrayerPray: (groupId: string, requestId: string, userId: string, prayingCount: number) => void;
  markPrayerAnswered: (groupId: string, requestId: string, answeredNote?: string) => void;
  purgeGroup: (groupId: string) => void;
  bindPrayerEvents: (groupId: string, currentUserId: string) => void;
  unbindPrayerEvents: () => void;
  bindGroupEvents: () => void;
  unbindGroupEvents: () => void;
}

export const useActivitiesStore = create<ActivitiesState>()(
  persist(
    (set, get) => ({
      activities: {},
      myCommitments: [],
      prayerRequests: {},

      setActivities: (groupId, activities) =>
        set((s) => ({ activities: { ...s.activities, [groupId]: activities } })),

      setMyCommitments: (commitments) => set({ myCommitments: commitments }),

      setPrayerRequests: (groupId, requests) =>
        set((s) => ({ prayerRequests: { ...s.prayerRequests, [groupId]: requests } })),

      upsertPrayerRequest: (groupId, request) =>
        set((s) => {
          const existing = s.prayerRequests[groupId] ?? [];
          const idx = existing.findIndex((r) => r._id === request._id);
          const updated = idx >= 0
            ? [...existing.slice(0, idx), request, ...existing.slice(idx + 1)]
            : [request, ...existing];
          return { prayerRequests: { ...s.prayerRequests, [groupId]: updated } };
        }),

      updatePrayerPray: (groupId, requestId, _userId, prayingCount) =>
        set((s) => {
          const existing = s.prayerRequests[groupId] ?? [];
          const updated = existing.map((r) =>
            r._id === requestId ? { ...r, prayingCount } : r
          );
          return { prayerRequests: { ...s.prayerRequests, [groupId]: updated } };
        }),

      markPrayerAnswered: (groupId, requestId, answeredNote) =>
        set((s) => {
          const existing = s.prayerRequests[groupId] ?? [];
          const updated = existing.map((r) =>
            r._id === requestId
              ? { ...r, isAnswered: true, answeredAt: new Date().toISOString(), answeredNote: answeredNote ?? '' }
              : r
          );
          return { prayerRequests: { ...s.prayerRequests, [groupId]: updated } };
        }),

      purgeGroup: (groupId) =>
        set((s) => {
          const { [groupId]: _a, ...restActivities } = s.activities;
          const { [groupId]: _p, ...restPrayers } = s.prayerRequests;
          return {
            activities: restActivities,
            prayerRequests: restPrayers,
            myCommitments: s.myCommitments.filter((c) => {
              const gId = typeof c.groupId === 'string' ? c.groupId : (c.groupId as any)?._id ?? c.groupId;
              return gId?.toString() !== groupId;
            }),
          };
        }),

      bindPrayerEvents: (groupId, currentUserId) => {
        const socket = getSocket();
        if (!socket) return;

        socket.on('prayer:new', ({ request }: { request: PrayerRequest }) => {
          if (request.groupId !== groupId) return;
          get().upsertPrayerRequest(groupId, {
            ...request,
            isPraying: false,
            isMyRequest: (request.authorId as any)?._id === currentUserId,
            prayingCount: 0,
          });
        });

        socket.on('prayer:pray', ({ requestId, userId, prayingCount }: { requestId: string; userId: string; prayingCount: number }) => {
          get().updatePrayerPray(groupId, requestId, userId, prayingCount);
        });

        socket.on('prayer:answered', ({ requestId, answeredNote }: { requestId: string; answeredNote?: string }) => {
          get().markPrayerAnswered(groupId, requestId, answeredNote);
        });
      },

      unbindPrayerEvents: () => {
        const socket = getSocket();
        if (!socket) return;
        socket.off('prayer:new');
        socket.off('prayer:pray');
        socket.off('prayer:answered');
      },

      bindGroupEvents: () => {
        const socket = getSocket();
        if (!socket) return;
        socket.on('group:deleted', ({ groupId }: { groupId: string }) => {
          get().purgeGroup(groupId);
        });
      },

      unbindGroupEvents: () => {
        const socket = getSocket();
        if (!socket) return;
        socket.off('group:deleted');
      },
    }),
    {
      name: 'activities-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activities: state.activities,
        myCommitments: state.myCommitments,
        prayerRequests: state.prayerRequests,
      }),
    }
  )
);

import { create } from 'zustand';
import type { Reel } from '../services/reelService';

// Estado de reels e historias. Sin persistencia: se recargan al entrar.
interface ReelsState {
  stories: Reel[];
  reels: Reel[];
  setStories: (stories: Reel[]) => void;
  setReels: (reels: Reel[]) => void;
  appendReels: (reels: Reel[]) => void;
  upsertReel: (reel: Reel) => void;
  updateLike: (id: string, liked: boolean, count: number) => void;
  updateViewed: (id: string) => void;
  removeReel: (id: string) => void;
}

export const useReelsStore = create<ReelsState>((set) => ({
  stories: [],
  reels: [],
  setStories: (stories) => set({ stories }),
  setReels: (reels) => set({ reels }),
  appendReels: (reels) =>
    set((s) => ({ reels: [...s.reels, ...reels.filter((r) => !s.reels.some((x) => x.id === r.id))] })),
  upsertReel: (reel) =>
    set((s) => {
      const inStories = reel.kind === 'story';
      const list = inStories ? s.stories : s.reels;
      const exists = list.some((x) => x.id === reel.id);
      const next = exists ? list.map((x) => (x.id === reel.id ? reel : x)) : [reel, ...list];
      return inStories ? { stories: next } : { reels: next };
    }),
  updateLike: (id, liked, count) =>
    set((s) => ({
      stories: s.stories.map((x) => (x.id === id ? { ...x, liked, likeCount: count } : x)),
      reels: s.reels.map((x) => (x.id === id ? { ...x, liked, likeCount: count } : x)),
    })),
  updateViewed: (id) =>
    set((s) => ({
      stories: s.stories.map((x) => (x.id === id ? { ...x, viewed: true } : x)),
      reels: s.reels.map((x) => (x.id === id ? { ...x, viewed: true } : x)),
    })),
  removeReel: (id) =>
    set((s) => ({ stories: s.stories.filter((x) => x.id !== id), reels: s.reels.filter((x) => x.id !== id) })),
}));

import { create } from 'zustand';
import { getOfferingStatusApi, getOfferingHistoryApi, type Offering, type OfferingStatus } from '../services/offeringService';

interface OfferingState {
  status: OfferingStatus | null;
  history: Offering[];
  loading: boolean;
  fetchStatus: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  reset: () => void;
}

export const useOfferingStore = create<OfferingState>((set) => ({
  status: null,
  history: [],
  loading: false,

  fetchStatus: async () => {
    set({ loading: true });
    try {
      const status = await getOfferingStatusApi();
      set({ status });
    } catch {
      // no es crítico
    } finally {
      set({ loading: false });
    }
  },

  fetchHistory: async () => {
    try {
      const history = await getOfferingHistoryApi();
      set({ history });
    } catch {
      // silently fail
    }
  },

  reset: () => set({ status: null, history: [], loading: false }),
}));

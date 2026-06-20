import { create } from 'zustand';
import { getSocket } from '../services/socketService';
import { fetchGroupCallToken } from '../services/groupCallService';

export interface IncomingGroupCall {
  conversationId: string;
  callType: 'audio' | 'video';
  initiatorName: string;
  groupName: string;
}

interface GroupCallState {
  isActive: boolean;
  callType: 'audio' | 'video';
  conversationId: string | null;
  livekitUrl: string | null;
  token: string | null;
  isJoining: boolean;
  incomingGroupCall: IncomingGroupCall | null;

  startGroupCall: (conversationId: string, callType: 'audio' | 'video', authToken: string) => Promise<void>;
  joinGroupCall: (authToken: string) => Promise<void>;
  dismissGroupCall: () => void;
  endGroupCall: () => void;
  bindGroupCallSocketEvents: () => void;
  unbindGroupCallSocketEvents: () => void;
}

const IDLE: Partial<GroupCallState> = {
  isActive: false,
  conversationId: null,
  livekitUrl: null,
  token: null,
  isJoining: false,
};

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  isActive: false,
  callType: 'audio',
  conversationId: null,
  livekitUrl: null,
  token: null,
  isJoining: false,
  incomingGroupCall: null,

  startGroupCall: async (conversationId, callType, authToken) => {
    set({ isJoining: true });
    try {
      const { token, livekitUrl } = await fetchGroupCallToken(authToken, conversationId);
      set({ ...IDLE, isActive: true, callType, conversationId, token, livekitUrl });
      getSocket()?.emit('call:group:start', { conversationId, callType });
    } catch {
      set({ isJoining: false });
    }
  },

  joinGroupCall: async (authToken) => {
    const { incomingGroupCall } = get();
    if (!incomingGroupCall) return;
    set({ isJoining: true });
    try {
      const { token, livekitUrl } = await fetchGroupCallToken(authToken, incomingGroupCall.conversationId);
      set({
        ...IDLE,
        isActive: true,
        callType: incomingGroupCall.callType,
        conversationId: incomingGroupCall.conversationId,
        token,
        livekitUrl,
        incomingGroupCall: null,
      });
    } catch {
      set({ isJoining: false });
    }
  },

  dismissGroupCall: () => set({ incomingGroupCall: null }),

  endGroupCall: () => set({ ...IDLE, callType: get().callType }),

  bindGroupCallSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('call:group:invite', (data: IncomingGroupCall) => {
      if (get().isActive) return; // already in a call
      set({ incomingGroupCall: data });
    });
  },

  unbindGroupCallSocketEvents: () => {
    getSocket()?.off('call:group:invite');
  },
}));

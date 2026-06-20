import { create } from 'zustand';
import { setAudioModeAsync } from 'expo-audio';
import { RTCSessionDescription, RTCIceCandidate, MediaStream } from '@livekit/react-native-webrtc';
import { getSocket } from '../services/socketService';
import {
  getLocalStream,
  createPeerConnection,
  addLocalStreamToPeer,
  closePeerConnection,
  getPeerConnection,
  setRemoteDescriptionSafe,
  addIceCandidateSafe,
} from '../services/callService';

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected';

// Candidatos ICE salientes encolados hasta conocer callId/peerId. Sin esto, los
// candidatos generados antes de `call:initiated` (cuando uno LLAMA) se perdían,
// y el peer nunca podía formar pares ICE → la llamada no conectaba.
let pendingOutgoingIce: RTCIceCandidateInit[] = [];
function sendIce(candidate: RTCIceCandidateInit) {
  const socket = getSocket();
  const { callId, peerId } = useCallStore.getState();
  if (socket && callId && peerId) {
    socket.emit('call:ice-candidate', { callId, peerId, candidate });
  } else {
    pendingOutgoingIce.push(candidate);
  }
}
function flushOutgoingIce() {
  const socket = getSocket();
  const { callId, peerId } = useCallStore.getState();
  if (!socket || !callId || !peerId) return;
  for (const candidate of pendingOutgoingIce) {
    socket.emit('call:ice-candidate', { callId, peerId, candidate });
  }
  pendingOutgoingIce = [];
}

export interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  conversationId: string;
  callType: 'audio' | 'video';
  offer: { type: string; sdp: string };
}

interface CallStoreState {
  callState: CallState;
  callId: string | null;
  peerId: string | null;
  peerName: string | null;
  peerAvatar: string | null;
  conversationId: string | null;
  callType: 'audio' | 'video';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeaker: boolean;
  incomingCall: IncomingCallData | null;

  startCall: (params: {
    peerId: string;
    peerName: string;
    peerAvatar?: string;
    conversationId: string;
    callType: 'audio' | 'video';
  }) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;

  bindCallSocketEvents: () => void;
  unbindCallSocketEvents: () => void;
}

const IDLE_STATE = {
  callState: 'idle' as CallState,
  callId: null,
  peerId: null,
  peerName: null,
  peerAvatar: null,
  conversationId: null,
  localStream: null,
  remoteStream: null,
  incomingCall: null,
  isMuted: false,
  isCameraOff: false,
  isSpeaker: false,
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  ...IDLE_STATE,
  callType: 'audio',

  startCall: async ({ peerId, peerName, peerAvatar, conversationId, callType }) => {
    const socket = getSocket();
    if (!socket) return;

    try {
      pendingOutgoingIce = [];
      const stream = await getLocalStream(callType === 'video');
      set({ localStream: stream, callState: 'calling', peerId, peerName, peerAvatar: peerAvatar ?? null, conversationId, callType });

      const newPc = createPeerConnection(
        (candidate) => sendIce(candidate),
        (remoteStream) => set({ remoteStream }),
        (state) => {
          if (state === 'connected') set({ callState: 'connected' });
          if (state === 'disconnected' || state === 'failed' || state === 'closed') get().endCall();
        }
      );

      await addLocalStreamToPeer(stream);
      const offer = await (newPc as any).createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await (newPc as any).setLocalDescription(new RTCSessionDescription(offer));

      socket.emit('call:initiate', {
        calleeId: peerId,
        conversationId,
        callType,
        offer: { type: offer.type, sdp: offer.sdp },
      });
    } catch {
      closePeerConnection();
      set({ ...IDLE_STATE, callType: get().callType });
    }
  },

  acceptCall: async () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    const socket = getSocket();
    if (!socket) return;

    pendingOutgoingIce = [];
    // Fija callId/peerId ANTES de crear la conexión para que los candidatos ICE
    // salgan con los identificadores correctos.
    set({
      callId: incomingCall.callId,
      peerId: incomingCall.callerId,
      peerName: incomingCall.callerName,
      peerAvatar: incomingCall.callerAvatar ?? null,
      conversationId: incomingCall.conversationId,
      callType: incomingCall.callType,
    });

    try {
      const stream = await getLocalStream(incomingCall.callType === 'video');

      const newPc = createPeerConnection(
        (candidate) => sendIce(candidate),
        (remoteStream) => set({ remoteStream }),
        (state) => {
          if (state === 'disconnected' || state === 'failed' || state === 'closed') get().endCall();
        }
      );

      await addLocalStreamToPeer(stream);
      await setRemoteDescriptionSafe(incomingCall.offer);
      const answer = await (newPc as any).createAnswer();
      await (newPc as any).setLocalDescription(new RTCSessionDescription(answer));

      set({
        callState: 'connected',
        localStream: stream,
        incomingCall: null,
      });
      flushOutgoingIce();

      socket.emit('call:answer', { callId: incomingCall.callId, answer: { type: answer.type, sdp: answer.sdp } });
    } catch {
      closePeerConnection();
      set({ ...IDLE_STATE, callType: get().callType });
    }
  },

  rejectCall: () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    getSocket()?.emit('call:reject', { callId: incomingCall.callId });
    pendingOutgoingIce = [];
    set({ ...IDLE_STATE, callType: get().callType });
  },

  endCall: () => {
    const { callId } = get();
    if (callId) getSocket()?.emit('call:end', { callId });
    closePeerConnection();
    pendingOutgoingIce = [];
    set({ ...IDLE_STATE, callType: get().callType });
  },

  toggleMute: () => {
    const { localStream, isMuted } = get();
    if (localStream) {
      (localStream as any).getAudioTracks().forEach((t: any) => { t.enabled = isMuted; });
    }
    set({ isMuted: !isMuted });
  },

  toggleCamera: () => {
    const { localStream, isCameraOff } = get();
    if (localStream) {
      (localStream as any).getVideoTracks().forEach((t: any) => { t.enabled = isCameraOff; });
    }
    set({ isCameraOff: !isCameraOff });
  },

  toggleSpeaker: () => {
    const next = !get().isSpeaker;
    set({ isSpeaker: next });
    try {
      setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {}
  },

  bindCallSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;
    const store = get();

    socket.on('call:initiated', ({ callId }: { callId: string }) => {
      set({ callId });
      flushOutgoingIce(); // envía los candidatos ICE encolados antes de tener callId
    });

    socket.on('call:incoming', (data: IncomingCallData) => {
      const { callState } = get();
      if (callState !== 'idle') {
        socket.emit('call:reject', { callId: data.callId });
        return;
      }
      set({ callState: 'receiving', incomingCall: data });
    });

    socket.on('call:answered', async ({ callId, answer }: { callId: string; answer: { type: string; sdp: string } }) => {
      try {
        await setRemoteDescriptionSafe(answer);
        set({ callId, callState: 'connected' });
      } catch {}
    });

    socket.on('call:ice-candidate', async ({ candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      await addIceCandidateSafe(candidate);
    });

    socket.on('call:ended', () => {
      store.endCall();
    });

    socket.on('call:rejected', () => {
      store.endCall();
    });

    socket.on('call:busy', () => {
      store.endCall();
    });
  },

  unbindCallSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;
    socket.off('call:initiated');
    socket.off('call:incoming');
    socket.off('call:answered');
    socket.off('call:ice-candidate');
    socket.off('call:ended');
    socket.off('call:rejected');
    socket.off('call:busy');
  },
}));

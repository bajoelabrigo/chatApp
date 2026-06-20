import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from '@livekit/react-native-webrtc';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let remoteDescSet = false;

export async function getLocalStream(video: boolean): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: 'user', width: 640, height: 480 } : false,
  });
  localStream = stream as unknown as MediaStream;
  return localStream;
}

export function createPeerConnection(
  onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  onRemoteStream: (stream: MediaStream) => void,
  onConnectionStateChange: (state: string) => void
): RTCPeerConnection {
  pc = new RTCPeerConnection(ICE_SERVERS);
  // Do NOT reset pendingCandidates here — candidates may have been queued
  // while the callee was deciding whether to accept the call (pc was null).
  remoteDescSet = false;

  // Build remote stream from individual tracks — event.streams can be empty
  // in react-native-webrtc with the New Architecture
  const remoteStream = new MediaStream(undefined);

  (pc as any).addEventListener('track', (event: any) => {
    if (event.streams?.[0]) {
      onRemoteStream(event.streams[0] as MediaStream);
    } else if (event.track) {
      (remoteStream as any).addTrack(event.track);
      onRemoteStream(remoteStream);
    }
  });

  (pc as any).addEventListener('icecandidate', (event: any) => {
    if (event.candidate) onIceCandidate(event.candidate.toJSON());
  });

  (pc as any).addEventListener('connectionstatechange', () => {
    if (pc) onConnectionStateChange((pc as any).connectionState ?? '');
  });

  return pc;
}

// Must call this instead of pc.setRemoteDescription directly so queued
// ICE candidates are drained once the remote description is ready
export async function setRemoteDescriptionSafe(desc: { type: string; sdp: string }): Promise<void> {
  if (!pc) return;
  await (pc as any).setRemoteDescription(new RTCSessionDescription(desc as any));
  remoteDescSet = true;
  for (const c of pendingCandidates) {
    try { await (pc as any).addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
  pendingCandidates = [];
}

// Use this instead of pc.addIceCandidate to handle candidates that arrive
// before setRemoteDescription completes (common race condition)
export async function addIceCandidateSafe(candidate: RTCIceCandidateInit): Promise<void> {
  // Queue if pc doesn't exist yet (callee hasn't accepted) or remote desc not set yet
  if (!pc || !remoteDescSet) {
    pendingCandidates.push(candidate);
    return;
  }
  try { await (pc as any).addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
}

export function getPeerConnection(): RTCPeerConnection | null { return pc; }
export function getLocalStreamRef(): MediaStream | null { return localStream; }

export async function addLocalStreamToPeer(stream: MediaStream): Promise<void> {
  if (!pc) return;
  (stream as any).getTracks().forEach((track: any) => {
    (pc as any).addTrack(track, stream);
  });
}

export function closePeerConnection(): void {
  if (pc) { (pc as any).close(); pc = null; }
  if (localStream) { (localStream as any).getTracks().forEach((t: any) => t.stop()); localStream = null; }
  pendingCandidates = [];
  remoteDescSet = false;
}

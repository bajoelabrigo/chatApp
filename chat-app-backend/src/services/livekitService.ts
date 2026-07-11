import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';

// LIVEKIT_URL es el endpoint WebSocket (wss://…) que consumen los clientes.
// La API de servidor (RoomServiceClient) habla HTTPS contra el mismo host.
function httpUrl(): string {
  const url = process.env.LIVEKIT_URL;
  if (!url) throw new Error('LIVEKIT_URL no configurada');
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

let client: RoomServiceClient | null = null;

export function roomService(): RoomServiceClient {
  if (!client) {
    client = new RoomServiceClient(
      httpUrl(),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
  }
  return client;
}

/**
 * Silencia una fuente publicada por un participante. LiveKit no expone
 * "silenciar al participante": hay que mutear cada track publicado de esa
 * fuente. Devuelve cuántos tracks se silenciaron.
 */
export async function muteParticipantSource(
  room: string,
  identity: string,
  source: TrackSource
): Promise<number> {
  const participant = await roomService().getParticipant(room, identity);
  const targets = participant.tracks.filter((t) => t.source === source && !t.muted);
  await Promise.all(
    targets.map((t) => roomService().mutePublishedTrack(room, identity, t.sid, true))
  );
  return targets.length;
}

export { TrackSource };

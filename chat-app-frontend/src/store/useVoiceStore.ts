import { create } from 'zustand';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Reproducción de notas de voz — UN solo reproductor para toda la app.
//
// Antes cada burbuja tenía su propio `useAudioPlayer`, atado al ciclo de vida
// del componente: al salir del chat (o al reciclar la fila la FlashList) el
// reproductor se liberaba y el audio se cortaba a media frase. WhatsApp sigue
// sonando hasta el final aunque te muevas por la app, así que el reproductor
// vive AQUÍ, fuera de React, y las burbujas solo pintan su estado.
//
// El reproductor no está en el store de zustand a propósito: es un objeto
// nativo (SharedObject), no un valor serializable, y meterlo dentro haría que
// cada `set` lo tratase como estado.
let player: AudioPlayer | null = null;
let sub: { remove: () => void } | null = null;

/** Duraciones ya conocidas, por URL: una burbuja que aún no ha sonado no tiene
 *  de dónde sacarla si su reproductor local todavía no cargó. */
const durationCache = new Map<string, number>();

export interface VoiceTrack {
  uri: string;
  messageId: string;
  conversationId: string;
  /** Quién mandó la nota — es lo que enseña la barra flotante. */
  title: string;
}

interface VoiceState extends Partial<VoiceTrack> {
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  play: (track: VoiceTrack) => Promise<void>;
  toggle: (track: VoiceTrack) => Promise<void>;
  pause: () => void;
  stop: () => void;
}

function release() {
  sub?.remove();
  sub = null;
  try {
    player?.remove();
  } catch {}
  player = null;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  uri: undefined,
  messageId: undefined,
  conversationId: undefined,
  title: undefined,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,

  play: async (track) => {
    const st = get();

    // Misma nota que ya estaba cargada: se reanuda donde se quedó.
    if (player && st.messageId === track.messageId) {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch {}
      // Si terminó, volver a darle al play empieza de nuevo.
      if (st.duration > 0 && st.position >= st.duration - 0.05) {
        try {
          await player.seekTo(0);
        } catch {}
      }
      player.play();
      set({ playing: true });
      return;
    }

    release();
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {}

    const p = createAudioPlayer({ uri: track.uri }, { updateInterval: 100 });
    player = p;
    set({
      ...track,
      playing: true,
      buffering: true,
      position: 0,
      duration: durationCache.get(track.uri) ?? 0,
    });

    sub = p.addListener('playbackStatusUpdate', (status) => {
      // Llega también de reproductores ya sustituidos: solo manda el actual.
      if (player !== p) return;
      if (status.duration > 0) durationCache.set(track.uri, status.duration);
      if (status.didJustFinish) {
        // Se queda cargada y al principio (como WhatsApp: el botón vuelve a ▶
        // y la duración sigue a la vista), no se libera.
        p.seekTo(0).catch(() => {});
        set({ playing: false, buffering: false, position: 0 });
        return;
      }
      set({
        playing: status.playing,
        buffering: status.isBuffering && !status.playing,
        position: status.currentTime ?? 0,
        duration: status.duration || durationCache.get(track.uri) || 0,
      });
    });

    p.play();
  },

  toggle: async (track) => {
    const st = get();
    if (st.messageId === track.messageId && st.playing) {
      get().pause();
      return;
    }
    await get().play(track);
  },

  pause: () => {
    try {
      player?.pause();
    } catch {}
    set({ playing: false, buffering: false });
  },

  stop: () => {
    release();
    set({
      uri: undefined,
      messageId: undefined,
      conversationId: undefined,
      title: undefined,
      playing: false,
      buffering: false,
      position: 0,
      duration: 0,
    });
  },
}));

/** Duración conocida de una nota (la que ya sonó alguna vez), en segundos. */
export const cachedDuration = (uri: string) => durationCache.get(uri) ?? 0;
export const rememberDuration = (uri: string, seconds: number) => {
  if (seconds > 0) durationCache.set(uri, seconds);
};

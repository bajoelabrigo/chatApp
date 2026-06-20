import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const STORAGE_KEY = 'app_ringtone_id';

const RINGTONE_MODULES: Record<string, number> = {
  ringtone1: require('../../assets/sounds/ringtone.wav') as number,
  ringtone2: require('../../assets/sounds/ringtone2.mp3') as number,
};

export const RINGTONE_OPTIONS: { id: string; label: string }[] = [
  { id: 'ringtone1', label: 'Tono clásico' },
  { id: 'ringtone2', label: 'Tono 2' },
];

let selectedId = 'ringtone1';

export async function loadRingtonePreference(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved in RINGTONE_MODULES) selectedId = saved;
  } catch {}
}

export async function saveRingtonePreference(id: string): Promise<void> {
  selectedId = id;
  try { await AsyncStorage.setItem(STORAGE_KEY, id); } catch {}
}

export function getSelectedRingtoneId(): string { return selectedId; }

let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;

async function resolveUri(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

async function playLoop(module: number, volume = 1.0): Promise<void> {
  await stop();
  try {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = await resolveUri(module);
    const player = createAudioPlayer({ uri }, { updateInterval: 1000 });
    player.loop = true;
    player.volume = volume;
    player.play();
    activePlayer = player;
  } catch (e) {
    console.warn('[ringtone] error:', e);
  }
}

export function playRingtone(): void {
  playLoop(RINGTONE_MODULES[selectedId] ?? RINGTONE_MODULES.ringtone1, 1.0);
}

export function playRingback(): void {
  playLoop(require('../../assets/sounds/ringback.wav') as number, 0.7);
}

export async function stop(): Promise<void> {
  if (!activePlayer) return;
  const p = activePlayer;
  activePlayer = null;
  try { p.pause(); } catch {}
  try { p.remove(); } catch {}
}

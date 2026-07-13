import Constants from 'expo-constants';
import api from './authService';
import { getMaterialFeed, type Material } from './materialsService';

// Popup de la pantalla de inicio. Qué se muestra, cuántas veces al día, cuánto
// dura en pantalla y en qué franja horaria NO debe salir lo decide el admin
// general desde el dashboard web (/users → Popups); la app solo lee la config en
// `GET /public/popup-config` y aplica la misma política que la web.
export type DailyKind = 'material' | 'prayer' | 'activity' | 'app' | 'custom';

export interface PrayerFeed {
  _id: string;
  content: string;
  authorName: string;
  groupId: string;
  groupName: string;
  isAnonymous: boolean;
}

export interface ActivityFeed {
  _id: string;
  name: string;
  type: string;
  emoji: string;
  groupId: string;
  groupName: string;
}

export interface CustomPopup {
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  url: string;
}

export interface AppUpdateInfo {
  latestVersion: string;
  apkUrl: string;
  downloadUrl: string;
  title: string;
  body: string;
}

export interface PopupKindSetting {
  kind: DailyKind;
  enabled: boolean;
  audience: 'all' | 'web' | 'app';
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface PopupConfig {
  enabled: boolean;
  timesPerDay: number;
  durationSeconds: number;
  minGapMinutes: number;
  quietHours: { enabled: boolean; start: number; end: number };
  kinds: PopupKindSetting[];
  custom: CustomPopup;
  appUpdate: AppUpdateInfo;
  helpVideos: { title: string; videoId: string; description: string }[];
}

export interface DailyPopup {
  kind: DailyKind;
  material?: Material;
  prayer?: PrayerFeed;
  activity?: ActivityFeed;
  custom?: CustomPopup;
  appUpdate?: AppUpdateInfo;
}

// Estado local (AsyncStorage) de lo ya mostrado hoy en este dispositivo.
export interface PopupState {
  date: string; // YYYY-MM-DD
  count: number; // veces mostradas hoy
  lastAt: number; // timestamp de la última vez
  kinds: DailyKind[]; // tipos ya mostrados hoy (para no repetir)
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const emptyPopupState = (): PopupState => ({
  date: todayStr(),
  count: 0,
  lastAt: 0,
  kinds: [],
});

// Versión instalada de la app (app.json → expo.version).
export const APP_VERSION: string =
  (Constants.expoConfig?.version as string) ||
  ((Constants as any).manifest?.version as string) ||
  '0.0.0';

// Compara "1.0.10" vs "1.0.3" numéricamente (no alfabéticamente).
export function isOlderVersion(current: string, latest: string): boolean {
  const a = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export async function getPopupConfig(): Promise<PopupConfig | null> {
  try {
    const { data } = await api.get<PopupConfig>('/public/popup-config');
    return data ?? null;
  } catch {
    return null;
  }
}

// Registra vista/clic/cierre para las métricas del dashboard. Silencioso: nunca
// debe romper la UI del popup.
export async function trackPopupEvent(
  token: string,
  kind: DailyKind,
  action: 'views' | 'clicks' | 'dismissals'
): Promise<void> {
  try {
    await api.post('/popup/event', { kind, action }, h(token));
  } catch {
    // silencioso
  }
}

// ¿La hora actual cae dentro de la franja silenciosa? Soporta franjas que
// cruzan la medianoche (23 → 7).
function inQuietHours(cfg: PopupConfig, now: Date): boolean {
  const q = cfg.quietHours;
  if (!q?.enabled) return false;
  const hour = now.getHours();
  if (q.start === q.end) return false;
  return q.start < q.end ? hour >= q.start && hour < q.end : hour >= q.start || hour < q.end;
}

function inWindow(k: PopupKindSetting, now: Date): boolean {
  if (k.startsAt && now < new Date(k.startsAt)) return false;
  if (k.endsAt && now > new Date(k.endsAt)) return false;
  return true;
}

// ¿Toca mostrar un popup ahora en este dispositivo?
export function canShowNow(cfg: PopupConfig, state: PopupState, now = new Date()): boolean {
  if (!cfg.enabled) return false;
  if (inQuietHours(cfg, now)) return false;
  const today = state.date === todayStr() ? state : emptyPopupState();
  if (today.count >= cfg.timesPerDay) return false;
  if (today.lastAt && now.getTime() - today.lastAt < cfg.minGapMinutes * 60_000) return false;
  return true;
}

async function fetchKind(
  token: string,
  kind: DailyKind,
  cfg: PopupConfig
): Promise<DailyPopup | null> {
  if (kind === 'material') {
    const material = await getMaterialFeed(token);
    return material ? { kind, material } : null;
  }
  if (kind === 'prayer') {
    const { data } = await api.get<PrayerFeed | null>('/users/me/prayer-feed', h(token));
    return data ? { kind, prayer: data } : null;
  }
  if (kind === 'activity') {
    const { data } = await api.get<ActivityFeed | null>('/users/me/activity-feed', h(token));
    return data ? { kind, activity: data } : null;
  }
  if (kind === 'app') {
    // En la app solo tiene sentido si la versión instalada se quedó atrás.
    if (!isOlderVersion(APP_VERSION, cfg.appUpdate?.latestVersion || '0.0.0')) return null;
    return { kind, appUpdate: cfg.appUpdate };
  }
  // custom: solo si el admin escribió al menos un título.
  return cfg.custom?.title ? { kind, custom: cfg.custom } : null;
}

// Una petición de oración al azar de mis grupos (la elige el backend). null si
// el usuario no tiene grupos o no hay peticiones abiertas. La usa también la
// tarjeta del Explorar de la Biblia.
export async function getPrayerFeed(token: string): Promise<PrayerFeed | null> {
  const { data } = await api.get<PrayerFeed | null>('/users/me/prayer-feed', h(token));
  return data ?? null;
}

// Elige qué popup mostrar: rota por día entre los tipos que el admin dejó
// activos (el orden del arreglo `kinds` es el orden de rotación) y, si el tipo
// que toca no tiene contenido, prueba el siguiente para no salir en blanco.
export async function getDailyPopup(
  token: string,
  cfg: PopupConfig,
  state: PopupState
): Promise<DailyPopup | null> {
  const now = new Date();
  const today = state.date === todayStr() ? state : emptyPopupState();

  const candidates = (cfg.kinds ?? []).filter(
    (k) => k.enabled && (k.audience === 'all' || k.audience === 'app') && inWindow(k, now)
  );
  if (candidates.length === 0) return null;

  // Punto de partida: el día (para que rote solo) + las veces que ya salió hoy
  // (para que la 2ª aparición del día no repita la 1ª).
  const day = Math.floor(Date.now() / 86_400_000);
  const start = (day + today.count) % candidates.length;

  // Los ya mostrados hoy van al final: se prueban solo si no queda otra cosa.
  const order = [...Array(candidates.length).keys()]
    .map((i) => candidates[(start + i) % candidates.length])
    .sort((a, b) => Number(today.kinds.includes(a.kind)) - Number(today.kinds.includes(b.kind)));

  for (const k of order) {
    try {
      const res = await fetchKind(token, k.kind, cfg);
      if (res) return res;
    } catch {
      // silencioso: probamos el siguiente tipo
    }
  }
  return null;
}

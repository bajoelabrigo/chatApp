import api from './authService';
import { getMaterialFeed, type Material } from './materialsService';

// Popup diario tipo "notificación" (esquina inferior, una vez al día). El
// contenido rota por día: materiales → oración → actividades. Si la categoría
// del día no tiene nada que mostrar, se cae a la siguiente para no salir vacío.
export type DailyKind = 'material' | 'prayer' | 'activity';

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

export interface DailyPopup {
  kind: DailyKind;
  material?: Material;
  prayer?: PrayerFeed;
  activity?: ActivityFeed;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

// Orden de rotación por índice de categoría (0,1,2).
const KINDS: DailyKind[] = ['material', 'prayer', 'activity'];

async function fetchKind(token: string, kind: DailyKind): Promise<DailyPopup | null> {
  if (kind === 'material') {
    const material = await getMaterialFeed(token);
    return material ? { kind, material } : null;
  }
  if (kind === 'prayer') {
    const { data } = await api.get<PrayerFeed | null>('/users/me/prayer-feed', h(token));
    return data ? { kind, prayer: data } : null;
  }
  const { data } = await api.get<ActivityFeed | null>('/users/me/activity-feed', h(token));
  return data ? { kind, activity: data } : null;
}

export async function getDailyPopup(token: string): Promise<DailyPopup | null> {
  // Día absoluto → categoría de hoy (misma fórmula en web y app para que roten
  // igual): día par de rotación de 3.
  const day = Math.floor(Date.now() / 86_400_000);
  const start = day % KINDS.length;
  for (let i = 0; i < KINDS.length; i++) {
    const kind = KINDS[(start + i) % KINDS.length];
    try {
      const res = await fetchKind(token, kind);
      if (res) return res;
    } catch {
      // silencioso: probamos la siguiente categoría
    }
  }
  return null;
}

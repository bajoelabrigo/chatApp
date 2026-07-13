import { Schema, model, Document } from 'mongoose';

// Configuración (documento único) de los popups de la pantalla de inicio, tanto
// de la web (holy_app) como de la app móvil. La edita el admin general desde el
// dashboard web (/users → pestaña Popups) y la leen los dos clientes con
// GET /public/popup-config.
export type PopupKind = 'material' | 'prayer' | 'activity' | 'app' | 'custom';

export const POPUP_KINDS: PopupKind[] = ['material', 'prayer', 'activity', 'app', 'custom'];

export interface PopupKindSetting {
  kind: PopupKind;
  enabled: boolean;
  // Dónde puede salir este tipo: en los dos clientes, solo en la web o solo en la app.
  audience: 'all' | 'web' | 'app';
  // Ventana de campaña (opcional). Fuera de ella el tipo se ignora.
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface IPopupConfig extends Document {
  enabled: boolean;
  // Cuántas veces al día puede aparecer un popup (por dispositivo).
  timesPerDay: number;
  // Segundos que queda en pantalla antes de cerrarse solo. 0 = hasta que el usuario lo cierre.
  durationSeconds: number;
  // Separación mínima entre dos apariciones del mismo día.
  minGapMinutes: number;
  // Franja en la que no se muestra nada (hora local del usuario, 0-23).
  quietHours: { enabled: boolean; start: number; end: number };
  // El orden del arreglo es el orden de rotación.
  kinds: PopupKindSetting[];
  custom: {
    title: string;
    body: string;
    imageUrl: string;
    ctaLabel: string;
    url: string;
  };
  appUpdate: {
    // La app se considera desactualizada si su `version` es menor que esta.
    latestVersion: string;
    apkUrl: string;
    downloadUrl: string;
    title: string;
    body: string;
  };
  // Videos de ayuda que se muestran en la página /descargar (tipo playlist).
  helpVideos: { title: string; videoId: string; description: string }[];
  // Contadores por tipo: { material: { views, clicks, dismissals }, ... }
  stats: Record<string, { views?: number; clicks?: number; dismissals?: number }>;
}

const kindSettingSchema = new Schema<PopupKindSetting>(
  {
    kind: { type: String, enum: POPUP_KINDS, required: true },
    enabled: { type: Boolean, default: true },
    audience: { type: String, enum: ['all', 'web', 'app'], default: 'all' },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { _id: false }
);

const popupConfigSchema = new Schema<IPopupConfig>(
  {
    enabled: { type: Boolean, default: true },
    timesPerDay: { type: Number, default: 1, min: 1, max: 10 },
    durationSeconds: { type: Number, default: 0, min: 0, max: 86400 },
    minGapMinutes: { type: Number, default: 60, min: 0, max: 1440 },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: Number, default: 23, min: 0, max: 23 },
      end: { type: Number, default: 7, min: 0, max: 23 },
    },
    kinds: {
      type: [kindSettingSchema],
      default: () =>
        POPUP_KINDS.map((kind) => ({
          kind,
          // Los tres originales siguen activos; los nuevos arrancan apagados
          // para que nada cambie hasta que el admin los encienda.
          enabled: kind === 'material' || kind === 'prayer' || kind === 'activity',
          audience: 'all' as const,
          startsAt: null,
          endsAt: null,
        })),
    },
    custom: {
      title: { type: String, default: '' },
      body: { type: String, default: '' },
      imageUrl: { type: String, default: '' },
      ctaLabel: { type: String, default: 'Ver más' },
      url: { type: String, default: '' },
    },
    appUpdate: {
      latestVersion: { type: String, default: '1.0.3' },
      apkUrl: { type: String, default: 'https://holyholyholy.es/downloads/HolyChat.apk' },
      downloadUrl: { type: String, default: 'https://holyholyholy.es/descargar' },
      title: { type: String, default: 'Actualiza HolyChat' },
      body: {
        type: String,
        default: 'Hay una versión nueva de la app con mejoras y correcciones. Descárgala e instálala encima de la actual.',
      },
    },
    helpVideos: {
      type: [
        {
          title: { type: String, default: '' },
          videoId: { type: String, required: true },
          description: { type: String, default: '' },
          _id: false,
        },
      ],
      default: () => [
        {
          videoId: 'DKLB1SRYpD4',
          title: 'Cómo instalar HolyChat en Android',
          description: 'Paso a paso para instalar la app desde la web en tu teléfono Android.',
        },
      ],
    },
    stats: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const PopupConfig = model<IPopupConfig>('PopupConfig', popupConfigSchema);

// Devuelve el documento único, creándolo con los valores por defecto la primera vez.
export async function getOrCreatePopupConfig(): Promise<IPopupConfig> {
  const existing = await PopupConfig.findOne();
  if (existing) return existing;
  return PopupConfig.create({});
}

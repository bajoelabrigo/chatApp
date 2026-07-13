import { Request, Response } from 'express';
import { PopupConfig, getOrCreatePopupConfig, POPUP_KINDS, PopupKind } from '../models/PopupConfig';
import { isGlobalAdmin } from '../services/adminService';

const ACTIONS = ['views', 'clicks', 'dismissals'] as const;
type PopupAction = (typeof ACTIONS)[number];

// Lo que ven los clientes: la configuración sin los contadores.
function publicView(cfg: any) {
  return {
    enabled: cfg.enabled,
    timesPerDay: cfg.timesPerDay,
    durationSeconds: cfg.durationSeconds,
    minGapMinutes: cfg.minGapMinutes,
    quietHours: cfg.quietHours,
    kinds: (cfg.kinds ?? []).map((k: any) => ({
      kind: k.kind,
      enabled: k.enabled,
      audience: k.audience,
      startsAt: k.startsAt,
      endsAt: k.endsAt,
    })),
    custom: cfg.custom,
    appUpdate: cfg.appUpdate,
    helpVideos: cfg.helpVideos,
    updatedAt: cfg.updatedAt,
  };
}

// GET /public/popup-config — sin auth: la lee la app, la web y la página pública
// /descargar (que necesita los videos de ayuda aunque no haya sesión).
export async function getPublicPopupConfig(_req: Request, res: Response) {
  try {
    const cfg = await getOrCreatePopupConfig();
    res.json(publicView(cfg.toObject()));
  } catch (err) {
    console.error('[popup] getPublicPopupConfig error', err);
    res.status(500).json({ error: 'Error obteniendo la configuración de popups' });
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);

// Extrae el ID de un video de YouTube tanto de una URL completa como del ID suelto.
function youtubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// PUT /popup/config — solo el admin general. Se reescribe el documento completo
// desde el formulario del dashboard, con validación campo a campo (nunca se
// vuelca `req.body` tal cual: `stats` no debe poder tocarse desde aquí).
export async function updatePopupConfig(req: Request, res: Response) {
  try {
    if (!(await isGlobalAdmin((req as any).userId))) {
      return res.status(403).json({ error: 'Solo el admin general puede cambiar los popups' });
    }

    const b = req.body ?? {};
    const cfg = await getOrCreatePopupConfig();

    if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
    if (Number.isFinite(b.timesPerDay)) cfg.timesPerDay = clamp(Math.round(b.timesPerDay), 1, 10);
    if (Number.isFinite(b.durationSeconds))
      cfg.durationSeconds = clamp(Math.round(b.durationSeconds), 0, 86400);
    if (Number.isFinite(b.minGapMinutes))
      cfg.minGapMinutes = clamp(Math.round(b.minGapMinutes), 0, 1440);

    if (b.quietHours) {
      cfg.quietHours = {
        enabled: !!b.quietHours.enabled,
        start: clamp(Math.round(Number(b.quietHours.start) || 0), 0, 23),
        end: clamp(Math.round(Number(b.quietHours.end) || 0), 0, 23),
      };
    }

    if (Array.isArray(b.kinds)) {
      // El orden que llega es el orden de rotación. Solo se aceptan tipos conocidos
      // y sin repetir; los que falten conservan su ajuste anterior.
      const seen = new Set<PopupKind>();
      const next = [];
      for (const k of b.kinds) {
        const kind = k?.kind as PopupKind;
        if (!POPUP_KINDS.includes(kind) || seen.has(kind)) continue;
        seen.add(kind);
        next.push({
          kind,
          enabled: !!k.enabled,
          audience: ['all', 'web', 'app'].includes(k.audience) ? k.audience : 'all',
          startsAt: k.startsAt ? new Date(k.startsAt) : null,
          endsAt: k.endsAt ? new Date(k.endsAt) : null,
        });
      }
      for (const prev of cfg.kinds) if (!seen.has(prev.kind)) next.push(prev);
      cfg.kinds = next as any;
    }

    if (b.custom) {
      cfg.custom = {
        title: str(b.custom.title),
        body: str(b.custom.body),
        imageUrl: str(b.custom.imageUrl),
        ctaLabel: str(b.custom.ctaLabel, 'Ver más') || 'Ver más',
        url: str(b.custom.url),
      };
    }

    if (b.appUpdate) {
      cfg.appUpdate = {
        latestVersion: str(b.appUpdate.latestVersion, cfg.appUpdate.latestVersion),
        apkUrl: str(b.appUpdate.apkUrl, cfg.appUpdate.apkUrl),
        downloadUrl: str(b.appUpdate.downloadUrl, cfg.appUpdate.downloadUrl),
        title: str(b.appUpdate.title, cfg.appUpdate.title),
        body: str(b.appUpdate.body, cfg.appUpdate.body),
      };
    }

    if (Array.isArray(b.helpVideos)) {
      cfg.helpVideos = b.helpVideos
        .map((v: any) => {
          const id = youtubeId(str(v?.videoId) || str(v?.url));
          return id
            ? { videoId: id, title: str(v?.title), description: str(v?.description) }
            : null;
        })
        .filter(Boolean)
        .slice(0, 20) as any;
    }

    await cfg.save();
    res.json(publicView(cfg.toObject()));
  } catch (err) {
    console.error('[popup] updatePopupConfig error', err);
    res.status(500).json({ error: 'Error guardando la configuración de popups' });
  }
}

// GET /popup/stats — contadores por tipo (solo admin general).
export async function getPopupStats(req: Request, res: Response) {
  try {
    if (!(await isGlobalAdmin((req as any).userId))) {
      return res.status(403).json({ error: 'Solo el admin general puede ver esto' });
    }
    const cfg = await getOrCreatePopupConfig();
    const stats: Record<string, any> = cfg.stats ?? {};
    res.json(
      POPUP_KINDS.map((kind) => {
        const s = stats[kind] ?? {};
        const views = s.views ?? 0;
        const clicks = s.clicks ?? 0;
        return {
          kind,
          views,
          clicks,
          dismissals: s.dismissals ?? 0,
          ctr: views ? Math.round((clicks / views) * 1000) / 10 : 0, // % con un decimal
        };
      })
    );
  } catch (err) {
    console.error('[popup] getPopupStats error', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
}

// POST /popup/stats/reset — pone los contadores a cero (solo admin general).
export async function resetPopupStats(req: Request, res: Response) {
  try {
    if (!(await isGlobalAdmin((req as any).userId))) {
      return res.status(403).json({ error: 'Solo el admin general puede hacer esto' });
    }
    const cfg = await getOrCreatePopupConfig();
    await PopupConfig.updateOne({ _id: cfg._id }, { $set: { stats: {} } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[popup] resetPopupStats error', err);
    res.status(500).json({ error: 'Error reiniciando estadísticas' });
  }
}

// POST /popup/event — { kind, action }. Lo llaman los dos clientes al mostrar,
// abrir o cerrar un popup. Incremento atómico: varios usuarios a la vez.
export async function trackPopupEvent(req: Request, res: Response) {
  try {
    const kind = req.body?.kind as PopupKind;
    const action = req.body?.action as PopupAction;
    if (!POPUP_KINDS.includes(kind) || !ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'Evento inválido' });
    }
    const cfg = await getOrCreatePopupConfig();
    await PopupConfig.updateOne({ _id: cfg._id }, { $inc: { [`stats.${kind}.${action}`]: 1 } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[popup] trackPopupEvent error', err);
    res.status(500).json({ error: 'Error registrando el evento' });
  }
}

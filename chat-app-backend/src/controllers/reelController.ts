import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Reel, IReel } from '../models/Reel';
import { deleteCloudinaryAsset } from '../services/cloudinaryService';
import { getYouTubeMeta, isYouTubeUrl } from '../lib/youtube';

// Reels e Historias (cortos verticales ≤60 s).
//
// Límites: 60 s por reel (lo mide el cliente al grabar/elegir; aquí se acepta
// el `durationSeconds` declarado y se topea a 60). Una historia caduca a las
// 24 h (TTL del modelo + filtro de lectura).
const MAX_DURATION = 60;
const STORY_TTL_HOURS = 24;
const PAGE_LIMIT = 10;

type AuthorDoc = { _id: Types.ObjectId; name: string; avatar?: string | null; isSocio?: boolean };

function serialize(reel: IReel & { authorId: AuthorDoc }, me: string) {
  const author = reel.authorId as unknown as AuthorDoc;
  const liked = (reel.likes || []).some((id) => id.toString() === me);
  const viewed = (reel.views || []).some((v) => v.userId.toString() === me);
  return {
    id: reel._id,
    kind: reel.kind,
    caption: reel.caption ?? '',
    durationSeconds: reel.durationSeconds,
    videoUrl: reel.videoUrl ?? '',
    youtubeVideoId: reel.youtubeVideoId ?? '',
    youtubeTitle: reel.youtubeTitle ?? '',
    thumbUrl: reel.thumbUrl ?? '',
    author: {
      id: author?._id,
      name: author?.name ?? 'Usuario',
      avatar: author?.avatar ?? '',
      isSocio: !!author?.isSocio,
    },
    createdAt: reel.createdAt,
    expiresAt: reel.expiresAt ?? null,
    likeCount: (reel.likes || []).length,
    viewCount: (reel.views || []).length,
    commentCount: (reel.comments || []).length,
    liked,
    viewed,
  };
}

const populateAuthor = { path: 'authorId', select: 'name avatar isSocio' };

// ── Crear ────────────────────────────────────────────────────────────────────
// Body: { kind, videoUrl?, cloudinaryPublicId?, youtubeUrl?, caption?, durationSeconds? }
export async function createReel(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { kind, videoUrl, cloudinaryPublicId, youtubeUrl, caption, durationSeconds } = req.body ?? {};

  if (kind !== 'reel' && kind !== 'story') {
    res.status(400).json({ error: 'kind debe ser reel o story' });
    return;
  }
  const cap = typeof caption === 'string' ? caption.trim().slice(0, 300) : '';
  const duration = durationSeconds == null ? undefined : Math.min(Math.max(1, Number(durationSeconds)), MAX_DURATION);

  const hasVideo = typeof videoUrl === 'string' && videoUrl.length > 0;
  const hasYouTube = typeof youtubeUrl === 'string' && youtubeUrl.trim().length > 0;
  if (hasVideo === hasYouTube) {
    res.status(400).json({ error: 'Se necesita un video subido O un enlace de YouTube' });
    return;
  }

  try {
    let youtubeVideoId: string | undefined;
    let youtubeTitle: string | undefined;
    let thumbUrl: string | undefined;
    if (hasYouTube) {
      const raw = youtubeUrl.trim();
      if (!isYouTubeUrl(raw)) {
        res.status(400).json({ error: 'El enlace no es de YouTube' });
        return;
      }
      const meta = await getYouTubeMeta(raw);
      if (!meta) {
        res.status(400).json({ error: 'No se pudo leer el enlace de YouTube' });
        return;
      }
      youtubeVideoId = meta.videoId;
      youtubeTitle = meta.title;
      thumbUrl = meta.thumbUrl;
    } else {
      thumbUrl = undefined; // la miniatura la hace el cliente con el póster del video
    }

    const expiresAt = kind === 'story' ? new Date(Date.now() + STORY_TTL_HOURS * 3600 * 1000) : undefined;

    const reel = await Reel.create({
      authorId: userId,
      kind,
      caption: cap || undefined,
      durationSeconds: duration,
      videoUrl: hasVideo ? videoUrl : undefined,
      cloudinaryPublicId: hasVideo ? cloudinaryPublicId ?? undefined : undefined,
      youtubeVideoId,
      youtubeTitle,
      thumbUrl,
      expiresAt,
    });

    const populated = await reel.populate(populateAuthor);
    res.status(201).json(serialize(populated as any, userId));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Error creando el reel' });
  }
}

// ── Feed de reels (permanentes) ──────────────────────────────────────────────
export async function getReelsFeed(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit ?? String(PAGE_LIMIT)), 10) || PAGE_LIMIT));

  try {
    const reels = await Reel.find({ kind: 'reel' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(populateAuthor)
      .lean();
    res.json(reels.map((r) => serialize(r as any, userId)));
  } catch {
    res.status(500).json({ error: 'Error obteniendo reels' });
  }
}

// ── Historias activas (≤24 h) ────────────────────────────────────────────────
export async function getStories(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  try {
    const stories = await Reel.find({ kind: 'story', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .populate(populateAuthor)
      .lean();
    res.json(stories.map((r) => serialize(r as any, userId)));
  } catch {
    res.status(500).json({ error: 'Error obteniendo historias' });
  }
}

// ── Me gusta (toggle atómico) ────────────────────────────────────────────────
export async function toggleLike(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findById(id);
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    const liked = (reel.likes || []).some((l) => l.toString() === userId);
    const upd = liked
      ? { $pull: { likes: new Types.ObjectId(userId) } }
      : { $addToSet: { likes: new Types.ObjectId(userId) } };
    const after = await Reel.findByIdAndUpdate(id, upd, { new: true }).lean();
    res.json({ liked: !liked, count: (after?.likes ?? []).length });
  } catch {
    res.status(500).json({ error: 'Error actualizando el like' });
  }
}

// ── Vista (una por usuario; sin duplicar) ────────────────────────────────────
export async function addView(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findOneAndUpdate(
      { _id: id, 'views.userId': { $ne: new Types.ObjectId(userId) } },
      { $push: { views: { userId: new Types.ObjectId(userId), at: new Date() } } },
      { new: true }
    );
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    res.json({ viewed: true, viewCount: (reel.views ?? []).length });
  } catch {
    res.status(500).json({ error: 'Error registrando la vista' });
  }
}

// ── Quién vio mi historia (solo el autor) ────────────────────────────────────
export async function getViewers(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findById(id);
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    if (reel.authorId.toString() !== userId) {
      res.status(403).json({ error: 'Solo el autor ve quién vio su historia' });
      return;
    }
    const viewers = await Reel.aggregate([
      { $match: { _id: reel._id } },
      { $unwind: '$views' },
      { $sort: { 'views.at': -1 } },
      { $limit: 200 },
      {
        $lookup: {
          from: 'users',
          localField: 'views.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$user._id',
          name: '$user.name',
          avatar: '$user.avatar',
          at: '$views.at',
        },
      },
    ]);
    res.json(viewers);
  } catch {
    res.status(500).json({ error: 'Error obteniendo viewers' });
  }
}

// ── Comentarios (un hilo plano por reel/historia) ─────────────────────────────
export async function addComment(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
  if (!text) { res.status(400).json({ error: 'El comentario está vacío' }); return; }
  try {
    const reel = await Reel.findByIdAndUpdate(
      id,
      { $push: { comments: { userId: new Types.ObjectId(userId), text, at: new Date() } } },
      { new: true }
    ).lean();
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    res.json({ ok: true, commentCount: (reel.comments ?? []).length });
  } catch {
    res.status(500).json({ error: 'Error añadiendo comentario' });
  }
}

export async function getComments(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const reel = await Reel.findById(id).lean();
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    const comments = await Reel.aggregate([
      { $match: { _id: reel._id } },
      { $unwind: '$comments' },
      { $sort: { 'comments.at': -1 } },
      { $limit: 200 },
      {
        $lookup: { from: 'users', localField: 'comments.userId', foreignField: '_id', as: 'user' },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$user._id',
          name: '$user.name',
          avatar: '$user.avatar',
          text: '$comments.text',
          at: '$comments.at',
        },
      },
    ]);
    res.json(comments);
  } catch {
    res.status(500).json({ error: 'Error obteniendo comentarios' });
  }
}

// ── Eliminar (solo el autor; borra el archivo de Cloudinary si lo hay) ───────
export async function deleteReel(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findOne({ _id: id, authorId: userId });
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    if (reel.cloudinaryPublicId) {
      deleteCloudinaryAsset(reel.cloudinaryPublicId, 'video').catch(() => {});
    }
    await reel.deleteOne();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando el reel' });
  }
}

// ── Metadata de YouTube para el formulario (preview antes de publicar) ───────
export async function getYouTubeMetaEndpoint(req: Request, res: Response) {
  const raw = String(req.query.url ?? '').trim();
  if (!raw) { res.status(400).json({ error: 'Falta el parámetro url' }); return; }
  if (!isYouTubeUrl(raw)) {
    res.status(400).json({ error: 'El enlace no es de YouTube' });
    return;
  }
  try {
    const meta = await getYouTubeMeta(raw);
    if (!meta) { res.status(400).json({ error: 'No se pudo leer el enlace de YouTube' }); return; }
    res.json(meta);
  } catch {
    res.status(500).json({ error: 'Error leyendo el enlace' });
  }
}

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Reel, IReel } from '../models/Reel';
import { deleteAssetIfUnused } from '../services/mediaCleanup';
import { getHiddenUserIds } from '../services/blocking';
import { isGlobalAdmin } from '../services/adminService';
import { Report } from '../models/Report';
import { notifyReelAuthor } from '../services/reelNotifier';
import { getYouTubeMeta, isYouTubeUrl } from '../lib/youtube';

// Reels e Historias (cortos verticales ≤60 s).
//
// Límites: 60 s por reel (lo mide el cliente al grabar/elegir; aquí se acepta
// el `durationSeconds` declarado y se topea a 60). Una historia caduca a las
// 24 h (TTL del modelo + filtro de lectura).
const MAX_DURATION = 60;
const STORY_TTL_HOURS = 24;
const PAGE_LIMIT = 10;
// Las historias no se paginan (el carrusel las enseña todas), pero sin tope una
// racha de publicaciones devolvería cientos de documentos CON sus arreglos de
// vistas y comentarios dentro, cada minuto y por persona.
const STORIES_LIMIT = 100;

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
    // Bloquear a alguien tiene que valer TAMBIÉN aquí: hasta ahora desaparecía
    // de tu muro y lo seguías viendo en los reels.
    //
    // Los bloqueos se piden EN PARALELO con los reels y el filtro se aplica en
    // memoria. Meterlos en el `$nin` obligaba a esperarlos primero, y eso es un
    // viaje de ida y vuelta más a Atlas (~205 ms desde el VPS) en un endpoint
    // que los clientes consultan solos. Como contrapartida, una página puede
    // devolver menos de `limit` elementos si el bloqueado sale en ella: con un
    // bloqueo en toda la base es un precio que no se nota.
    const [hidden, reels] = await Promise.all([
      getHiddenUserIds(userId),
      Reel.find({ kind: 'reel' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(populateAuthor)
        .lean(),
    ]);
    const visibles = reels.filter((r: any) => !hidden.has(r.authorId?._id?.toString()));
    res.json(visibles.map((r) => serialize(r as any, userId)));
  } catch {
    res.status(500).json({ error: 'Error obteniendo reels' });
  }
}

// ── Historias activas (≤24 h) ────────────────────────────────────────────────
export async function getStories(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  try {
    // En paralelo, por lo mismo que el feed: esto se pide cada minuto desde el
    // carrusel de historias y un viaje de más aquí se paga 1.440 veces al día
    // por cada persona conectada.
    const [hidden, stories] = await Promise.all([
      getHiddenUserIds(userId),
      Reel.find({ kind: 'story', expiresAt: { $gt: new Date() } })
        .sort({ createdAt: -1 })
        .limit(STORIES_LIMIT)
        .populate(populateAuthor)
        .lean(),
    ]);
    const visibles = stories.filter((r: any) => !hidden.has(r.authorId?._id?.toString()));
    res.json(visibles.map((r) => serialize(r as any, userId)));
  } catch {
    res.status(500).json({ error: 'Error obteniendo historias' });
  }
}

// ── Reels e historias de UNA persona (para su perfil) ──────────────────
//
// Sin esto un reel solo existía mientras pasaba por el feed y después se perdía:
// no había ningún sitio donde ver lo que ha publicado alguien. Devuelve los
// reels (permanentes) y, aparte, sus historias vivas, para que el perfil pueda
// pintar el anillo y abrirlas.
export async function getUserReels(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { userId: target } = req.params;
  const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit ?? '30'), 10) || 30));

  try {
    if (!Types.ObjectId.isValid(target)) {
      res.status(400).json({ error: 'Usuario inválido' });
      return;
    }
    // Un bloqueo tapa el perfil entero: ni sus reels ni sus historias.
    const [hidden, reels, stories] = await Promise.all([
      getHiddenUserIds(userId),
      Reel.find({ kind: 'reel', authorId: target })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate(populateAuthor)
        .lean(),
      Reel.find({ kind: 'story', authorId: target, expiresAt: { $gt: new Date() } })
        .sort({ createdAt: -1 })
        .populate(populateAuthor)
        .lean(),
    ]);
    if (hidden.has(target)) {
      res.json({ reels: [], stories: [] });
      return;
    }
    res.json({
      reels: reels.map((r) => serialize(r as any, userId)),
      stories: stories.map((r) => serialize(r as any, userId)),
    });
  } catch {
    res.status(500).json({ error: 'Error obteniendo los reels del usuario' });
  }
}

// ── Me gusta (toggle atómico) ────────────────────────────────────────────────
export async function toggleLike(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findById(id);
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    const uid = new Types.ObjectId(userId);
    const liked = (reel.likes || []).some((l) => l.toString() === userId);
    // El sello de hora se mueve en el MISMO update que el me gusta: si no, un
    // fallo entre los dos dejaría un me gusta sin hora (invisible en la campana)
    // o una hora sin me gusta.
    const upd = liked
      ? { $pull: { likes: uid, likedAt: { userId: uid } } }
      : { $addToSet: { likes: uid }, $push: { likedAt: { userId: uid, at: new Date() } } };
    const after = await Reel.findByIdAndUpdate(id, upd as any, { new: true }).lean();
    res.json({ liked: !liked, count: (after?.likes ?? []).length });

    // Aviso al autor solo al AÑADIR el me gusta: quitarlo no es una novedad.
    if (!liked) notifyReelAuthor(reel, userId, 'like').catch(() => {});
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
    if (reel) { res.json({ viewed: true, viewCount: (reel.views ?? []).length }); return; }

    // `null` aquí casi siempre significa "ya lo había visto", no "no existe":
    // el filtro incluye `views.userId: {$ne: yo}`. Devolver 404 era mentir, y
    // dejaba el log lleno de 404 falsos en el evento MÁS frecuente de todos.
    const existing = await Reel.findById(id).select('views').lean();
    if (!existing) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    res.json({ viewed: true, viewCount: (existing.views ?? []).length });
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
    notifyReelAuthor(reel as any, userId, 'comment', text).catch(() => {});
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

// ── Eliminar (solo el autor; borra el archivo de Cloudinary si no lo usa nadie más)
export async function deleteReel(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const reel = await Reel.findById(id);
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    // El autor, o un admin general. Sin esto NADIE podía retirar un video
    // inapropiado salvo quien lo subió — que es justo el que no va a hacerlo.
    if (reel.authorId.toString() !== userId && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esto' });
      return;
    }
    const asset = { publicId: reel.cloudinaryPublicId, url: reel.videoUrl, exceptReelId: reel._id as any };
    await reel.deleteOne();
    res.json({ ok: true });

    // La limpieza va DESPUÉS de borrar el documento y fuera de la respuesta.
    // Y comprueba antes que no quede otro documento usando el mismo archivo: el
    // editor de publicaciones permite mandar un video a reel, historia y muro a
    // la vez, y los tres comparten el `cloudinaryPublicId` (se sube una sola vez).
    deleteAssetIfUnused(asset).catch(() => {});
  } catch {
    res.status(500).json({ error: 'Error eliminando el reel' });
  }
}

// ── Denunciar (cualquiera con sesión, una vez por persona) ─────────────
//
// Reutiliza el modelo `Report` que ya usaban grupos y usuarios en vez de crear
// otra colección: el admin mira un solo sitio.
export async function reportReel(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  try {
    const reel = await Reel.findById(id).select('_id').lean();
    if (!reel) { res.status(404).json({ error: 'Reel no encontrado' }); return; }
    // Denunciar dos veces lo mismo no añade información y falsea el recuento.
    await Report.updateOne(
      { reporterId: new Types.ObjectId(userId), targetId: reel._id, targetType: 'reel' },
      { $set: { reason } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error enviando la denuncia' });
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

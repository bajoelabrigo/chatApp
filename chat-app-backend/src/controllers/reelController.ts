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

// Variedad de autores, igual que el feed de publicaciones: cada reel EXTRA del
// mismo autor compite como si fuera 24 h más antiguo. Sin esto quien publica
// mucho se queda la portada — medido en producción, 4 de los 5 reels del feed
// eran de la misma persona y salían seguidos.
const AUTHOR_DEMOTION_MS = 24 * 60 * 60 * 1000;

/**
 * Etapas que dejan el documento con lo que el cliente necesita Y NADA MÁS.
 *
 * `Reel.find().lean()` traía los arrays completos de `likes`, `views` y
 * `comments` para acabar usando solo sus recuentos: hoy son 624 bytes por
 * documento, pero un reel con 5.000 vistas son ~250 KB de arreglo viajando de
 * París a São Paulo en cada carga del feed para calcular un número.
 * `$size` y `$in` lo resuelven en el servidor de base de datos.
 */
function shapeStages(viewer: Types.ObjectId): any[] {
  return [
    {
      $project: {
        kind: 1, caption: 1, durationSeconds: 1, videoUrl: 1,
        youtubeVideoId: 1, youtubeTitle: 1, thumbUrl: 1,
        authorId: 1, createdAt: 1, expiresAt: 1,
        likeCount: { $size: { $ifNull: ['$likes', []] } },
        viewCount: { $size: { $ifNull: ['$views', []] } },
        commentCount: { $size: { $ifNull: ['$comments', []] } },
        liked: { $in: [viewer, { $ifNull: ['$likes', []] }] },
        viewed: { $in: [viewer, { $ifNull: ['$views.userId', []] }] },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'authorId',
        foreignField: '_id',
        as: 'author',
        pipeline: [{ $project: { name: 1, avatar: 1, isSocio: 1 } }],
      },
    },
    // `preserveNull`: si al autor lo borraron, el reel sigue saliendo con un
    // nombre de respaldo en vez de desaparecer del feed sin explicación.
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
  ];
}

/** Da a un documento ya agregado la MISMA forma que devuelve `serialize`. */
function shapeAggregated(r: any) {
  return {
    id: r._id,
    kind: r.kind,
    caption: r.caption ?? '',
    durationSeconds: r.durationSeconds,
    videoUrl: r.videoUrl ?? '',
    youtubeVideoId: r.youtubeVideoId ?? '',
    youtubeTitle: r.youtubeTitle ?? '',
    thumbUrl: r.thumbUrl ?? '',
    author: {
      id: r.author?._id ?? r.authorId,
      name: r.author?.name ?? 'Usuario',
      avatar: r.author?.avatar ?? '',
      isSocio: !!r.author?.isSocio,
    },
    createdAt: r.createdAt,
    expiresAt: r.expiresAt ?? null,
    likeCount: r.likeCount ?? 0,
    viewCount: r.viewCount ?? 0,
    commentCount: r.commentCount ?? 0,
    liked: !!r.liked,
    viewed: !!r.viewed,
  };
}

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
    const viewer = new Types.ObjectId(userId);
    // Bloquear a alguien tiene que valer TAMBIÉN aquí: hasta ahora desaparecía
    // de tu muro y lo seguías viendo en los reels.
    //
    // Los bloqueos se piden EN PARALELO con los reels y el filtro se aplica en
    // memoria. Meterlos en el `$match` obligaba a esperarlos primero, y eso es
    // un viaje de ida y vuelta más a Atlas (~205 ms desde el VPS) en un endpoint
    // que los clientes consultan solos. Como contrapartida, una página puede
    // devolver menos de `limit` elementos si el bloqueado sale en ella: con un
    // bloqueo en toda la base es un precio que no se nota.
    const [hidden, reels] = await Promise.all([
      getHiddenUserIds(userId),
      reelFeedPage(viewer, (page - 1) * limit, limit),
    ]);
    const visibles = reels.filter((r: any) => !hidden.has(r.authorId?.toString()));
    res.json(visibles.map(shapeAggregated));
  } catch {
    res.status(500).json({ error: 'Error obteniendo reels' });
  }
}

/**
 * Una página del feed, ordenada por VARIEDAD DE AUTORES y ya proyectada.
 *
 * `$setWindowFields` es de Mongo 5.0: si el servidor no lo soporta se cae al
 * orden cronológico de siempre en vez de dejar el feed vacío (mismo respaldo
 * que `orderFeedIds` en el feed de publicaciones).
 */
async function reelFeedPage(viewer: Types.ObjectId, skip: number, limit: number): Promise<any[]> {
  const base = [{ $match: { kind: 'reel' } }];
  try {
    return await Reel.aggregate([
      ...base,
      {
        $setWindowFields: {
          partitionBy: '$authorId',
          sortBy: { createdAt: -1 },
          output: { authorRank: { $documentNumber: {} } },
        },
      },
      {
        $addFields: {
          feedScore: {
            $subtract: ['$createdAt', { $multiply: [{ $subtract: ['$authorRank', 1] }, AUTHOR_DEMOTION_MS] }],
          },
        },
      },
      { $sort: { feedScore: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...shapeStages(viewer),
    ]);
  } catch {
    return Reel.aggregate([
      ...base,
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...shapeStages(viewer),
    ]);
  }
}

// ── Historias activas (≤24 h) ────────────────────────────────────────────────
export async function getStories(req: Request, res: Response) {
  const userId = (req as any).userId as string;
  try {
    const viewer = new Types.ObjectId(userId);
    // En paralelo, por lo mismo que el feed: esto se pide cada minuto desde el
    // carrusel de historias y un viaje de más aquí se paga 1.440 veces al día
    // por cada persona conectada.
    const [hidden, stories] = await Promise.all([
      getHiddenUserIds(userId),
      Reel.aggregate([
        { $match: { kind: 'story', expiresAt: { $gt: new Date() } } },
        { $sort: { createdAt: -1 } },
        { $limit: STORIES_LIMIT },
        ...shapeStages(viewer),
      ]),
    ]);
    const visibles = stories.filter((r: any) => !hidden.has(r.authorId?.toString()));
    res.json(visibles.map(shapeAggregated));
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
    const viewer = new Types.ObjectId(userId);
    const autor = new Types.ObjectId(target);
    // Un bloqueo tapa el perfil entero: ni sus reels ni sus historias.
    const [hidden, reels, stories] = await Promise.all([
      getHiddenUserIds(userId),
      Reel.aggregate([
        { $match: { kind: 'reel', authorId: autor } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        ...shapeStages(viewer),
      ]),
      Reel.aggregate([
        { $match: { kind: 'story', authorId: autor, expiresAt: { $gt: new Date() } } },
        { $sort: { createdAt: -1 } },
        { $limit: STORIES_LIMIT },
        ...shapeStages(viewer),
      ]),
    ]);
    if (hidden.has(target)) {
      res.json({ reels: [], stories: [] });
      return;
    }
    res.json({
      reels: reels.map(shapeAggregated),
      stories: stories.map(shapeAggregated),
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
  // `parentId`: responder a un comentario concreto en vez de al reel.
  const parentId = typeof req.body?.parentId === 'string' ? req.body.parentId : '';
  if (!text) { res.status(400).json({ error: 'El comentario está vacío' }); return; }
  try {
    const uid = new Types.ObjectId(userId);

    if (parentId) {
      if (!Types.ObjectId.isValid(parentId)) {
        res.status(400).json({ error: 'Comentario no válido' });
        return;
      }
      // Update atómico sobre el comentario padre. `arrayFilters` NO castea por
      // esquema, así que el id va convertido a mano (misma trampa que el
      // progreso del seminario en la web).
      const conRespuesta = await Reel.findOneAndUpdate(
        { _id: id, 'comments._id': new Types.ObjectId(parentId) },
        { $push: { 'comments.$[c].replies': { userId: uid, text, at: new Date() } } },
        { new: true, arrayFilters: [{ 'c._id': new Types.ObjectId(parentId) }] }
      ).lean();
      if (!conRespuesta) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }
      res.json({ ok: true, commentCount: (conRespuesta.comments ?? []).length });

      // Avisa a quien escribió el comentario, no al autor del reel: la respuesta
      // es para él. Si es el mismo, `notifyReelAuthor` ya no se avisa a sí mismo.
      const padre = (conRespuesta.comments ?? []).find((c: any) => c._id?.toString() === parentId);
      if (padre?.userId) {
        notifyReelAuthor(
          { ...(conRespuesta as any), authorId: padre.userId },
          userId,
          'comment',
          text
        ).catch(() => {});
      }
      return;
    }

    const reel = await Reel.findByIdAndUpdate(
      id,
      { $push: { comments: { userId: uid, text, at: new Date() } } },
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
      // Las caras de quienes respondieron, en UNA sola búsqueda para todo el
      // hilo: un `$lookup` por respuesta sería una consulta por cara.
      {
        $lookup: {
          from: 'users',
          localField: 'comments.replies.userId',
          foreignField: '_id',
          as: 'replyUsers',
          pipeline: [{ $project: { name: 1, avatar: 1 } }],
        },
      },
      {
        $project: {
          _id: 0,
          id: '$comments._id',
          userId: '$user._id',
          name: '$user.name',
          avatar: '$user.avatar',
          text: '$comments.text',
          at: '$comments.at',
          replies: {
            $map: {
              input: { $ifNull: ['$comments.replies', []] },
              as: 'r',
              in: {
                userId: '$$r.userId',
                text: '$$r.text',
                at: '$$r.at',
                name: {
                  $let: {
                    vars: { u: { $first: { $filter: { input: '$replyUsers', cond: { $eq: ['$$this._id', '$$r.userId'] } } } } },
                    in: { $ifNull: ['$$u.name', 'Usuario'] },
                  },
                },
                avatar: {
                  $let: {
                    vars: { u: { $first: { $filter: { input: '$replyUsers', cond: { $eq: ['$$this._id', '$$r.userId'] } } } } },
                    in: { $ifNull: ['$$u.avatar', ''] },
                  },
                },
              },
            },
          },
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

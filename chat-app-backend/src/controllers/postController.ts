import { Response } from 'express';
import { Types } from 'mongoose';
import { Post, IPost, IComment, IReaction, IPostLinked, IPostVerse } from '../models/Post';
import { User } from '../models/User';
import { ConnectionRequest } from '../models/ConnectionRequest';
import { AuthRequest } from '../middleware/authMiddleware';
import { isGlobalAdmin } from '../services/adminService';
import { deleteCloudinaryUrls } from '../services/cloudinaryService';
import { deleteAssetIfUnused } from '../services/mediaCleanup';
// Bloqueos bidireccionales: viven en un servicio para que TODOS los feeds los
// respeten (el de reels no lo hacía).
import { getHiddenUserIds } from '../services/blocking';
import { hasVisibleText } from '../utils/postContent';

const AUTHOR_POPULATE = 'name avatar bio role isSocio';
const COMMENT_USER_POPULATE = 'name avatar isSocio';

const SHARE_NETWORKS = [
  'facebook', 'messenger', 'twitter', 'telegram', 'whatsapp',
  'pinterest', 'email', 'threads', 'linkedin', 'webshare',
] as const;

function idStr(v: any): string {
  return v?._id ? v._id.toString() : v?.toString?.() ?? String(v);
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// ── Reacciones (👍 vive en `likes` para posts por compatibilidad con `likePost`;
// el resto de emojis van en `reactions`. Comentarios/respuestas no tienen `likes`
// aparte, todo pasa por `reactions`) ──────────────────────────────────────────
function toggleReaction(reactions: IReaction[], emoji: string, userId: string): IReaction[] {
  const had = reactions.some((r) => r.emoji === emoji && r.users.some((u) => idStr(u) === userId));
  const cleaned = reactions
    .map((r) => ({ emoji: r.emoji, users: r.users.filter((u) => idStr(u) !== userId) }))
    .filter((r) => r.users.length > 0) as IReaction[];
  if (had) return cleaned;
  const existing = cleaned.find((r) => r.emoji === emoji);
  if (existing) existing.users.push(new Types.ObjectId(userId) as any);
  else cleaned.push({ emoji, users: [new Types.ObjectId(userId) as any] });
  return cleaned;
}

function applyPostReaction(post: IPost, emoji: string, userId: string): void {
  const hadLike = post.likes.some((u) => idStr(u) === userId);
  const hadEmoji = post.reactions.some((r) => r.emoji === emoji && r.users.some((u) => idStr(u) === userId));
  const hadThis = emoji === '👍' ? hadLike : hadEmoji;

  post.likes = post.likes.filter((u) => idStr(u) !== userId) as any;
  post.reactions = post.reactions
    .map((r) => ({ emoji: r.emoji, users: r.users.filter((u) => idStr(u) !== userId) }))
    .filter((r) => r.users.length > 0) as any;

  if (!hadThis) {
    if (emoji === '👍') {
      post.likes.push(new Types.ObjectId(userId) as any);
    } else {
      const existing = post.reactions.find((r) => r.emoji === emoji);
      if (existing) existing.users.push(new Types.ObjectId(userId) as any);
      else post.reactions.push({ emoji, users: [new Types.ObjectId(userId) as any] });
    }
  }
}

// ── Pasaje bíblico para posts `linked.type === "bible"` (versión reducida del
// `biblePassage.js` de la web — solo lo que createPost necesita) ─────────────
function normalizeVerses(verses: IPostVerse[]): IPostVerse[] {
  return [...verses]
    .filter((v) => v && v.book && v.chapter != null && v.verse != null)
    .sort((a, b) => (a.chapter! - b.chapter!) || (a.verse! - b.verse!));
}

function passageReference(verses: IPostVerse[]): string {
  if (!verses.length) return '';
  const byChapter = new Map<number, number[]>();
  for (const v of verses) {
    const list = byChapter.get(v.chapter!) ?? [];
    list.push(v.verse!);
    byChapter.set(v.chapter!, list);
  }
  const parts: string[] = [];
  for (const [chapter, verseNums] of byChapter) {
    const sorted = [...verseNums].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) { prev = cur; continue; }
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      if (cur !== undefined) { start = cur; prev = cur; }
    }
    parts.push(`${chapter}:${ranges.join(',')}`);
  }
  return `${verses[0].book} ${parts.join('; ')}`;
}

function passageText(verses: IPostVerse[]): string {
  return verses.map((v) => v.text).join(' ');
}

// ── Relación del viewer con cada autor de la página (una sola consulta) ──────
async function getRelationsToAuthors(
  viewerId: string,
  authorIds: string[]
): Promise<Record<string, { status: string; requestId?: string }>> {
  const relations: Record<string, { status: string; requestId?: string }> = {};
  const unique = [...new Set(authorIds)].filter((id) => id !== viewerId);

  const viewer = await User.findById(viewerId).select('connections').lean();
  const connectionSet = new Set((viewer?.connections ?? []).map((id: any) => id.toString()));

  const pendingMap = new Map<string, any>();
  if (unique.length) {
    const pending = await ConnectionRequest.find({
      status: 'pending',
      $or: [
        { sender: viewerId, recipient: { $in: unique } },
        { sender: { $in: unique }, recipient: viewerId },
      ],
    }).lean();
    for (const r of pending) {
      const other = r.sender.toString() === viewerId ? r.recipient.toString() : r.sender.toString();
      pendingMap.set(other, r);
    }
  }

  for (const id of authorIds) {
    if (id === viewerId) { relations[id] = { status: 'self' }; continue; }
    if (connectionSet.has(id)) { relations[id] = { status: 'connected' }; continue; }
    const req = pendingMap.get(id);
    if (req) {
      relations[id] = {
        status: req.sender.toString() === viewerId ? 'pending' : 'received',
        requestId: req._id.toString(),
      };
      continue;
    }
    relations[id] = { status: 'not_connected' };
  }
  return relations;
}

function stripBlockedComments(post: any, hidden: Set<string>) {
  post.comments = (post.comments ?? [])
    .filter((c: any) => !hidden.has(idStr(c.user)))
    .map((c: any) => ({ ...c, replies: (c.replies ?? []).filter((r: any) => !hidden.has(idStr(r.user))) }));
  return post;
}

// La variedad de autores igual que la web: cada post EXTRA del mismo autor
// compite como si fuera 24h más antiguo, para que quien publica mucho no se
// quede la portada. Con fallback cronológico si Mongo no soporta la etapa.
const AUTHOR_DEMOTION_MS = 24 * 60 * 60 * 1000;

async function orderFeedIds(query: any, skip: number, limit: number): Promise<Types.ObjectId[] | null> {
  try {
    const rows = await Post.aggregate([
      { $match: query },
      {
        $setWindowFields: {
          partitionBy: '$author',
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
      { $project: { _id: 1 } },
    ]);
    return rows.map((r) => r._id);
  } catch {
    return null;
  }
}

function shapePost(p: any, viewerId: string, relations: Record<string, { status: string; requestId?: string }>) {
  const authorId = idStr(p.author);
  return {
    ...p,
    isLiked: (p.likes ?? []).some((u: any) => idStr(u) === viewerId),
    isSaved: (p.savedBy ?? []).some((u: any) => idStr(u) === viewerId),
    authorRelation: relations[authorId]?.status ?? 'not_connected',
  };
}

// GET /posts — feed. scope=discover|friends
export async function getFeedPosts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const scope = req.query.scope === 'friends' ? 'friends' : 'discover';
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const skip = (page - 1) * limit;

    const hidden = await getHiddenUserIds(userId);
    const query: any = { author: { $nin: [...hidden] } };

    if (scope === 'friends') {
      const [me, admins] = await Promise.all([
        User.findById(userId).select('connections following').lean(),
        User.find({ role: 'admin' } as any).select('_id').lean(),
      ]);
      const authorIds = new Set<string>([userId]);
      (me?.connections ?? []).forEach((id: any) => authorIds.add(id.toString()));
      (me?.following ?? []).forEach((id: any) => authorIds.add(id.toString()));
      admins.forEach((a: any) => authorIds.add(a._id.toString()));
      hidden.forEach((id) => authorIds.delete(id));
      query.author = { $in: [...authorIds] };
    }

    const orderedIds = await orderFeedIds(query, skip, limit);
    let posts: any[];
    if (orderedIds) {
      const found = await Post.find({ _id: { $in: orderedIds } })
        .populate('author', AUTHOR_POPULATE)
        .populate('comments.user', COMMENT_USER_POPULATE)
        .populate('comments.replies.user', COMMENT_USER_POPULATE)
        .lean();
      const map = new Map(found.map((p: any) => [p._id.toString(), p]));
      posts = orderedIds.map((id) => map.get(id.toString())).filter(Boolean);
    } else {
      posts = await Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', AUTHOR_POPULATE)
        .populate('comments.user', COMMENT_USER_POPULATE)
        .populate('comments.replies.user', COMMENT_USER_POPULATE)
        .lean();
    }

    const authorIds = [...new Set(posts.map((p) => idStr(p.author)))];
    const relations = await getRelationsToAuthors(userId, authorIds);

    res.json(posts.map((p) => shapePost(stripBlockedComments(p, hidden), userId, relations)));
  } catch (err) {
    console.error('getFeedPosts:', err);
    res.status(500).json({ error: 'Error obteniendo el feed' });
  }
}

// GET /posts/saved
export async function getSavedPosts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const hidden = await getHiddenUserIds(userId);

    const posts = await Post.find({ savedBy: userId, author: { $nin: [...hidden] } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_POPULATE)
      .populate('comments.user', COMMENT_USER_POPULATE)
      .populate('comments.replies.user', COMMENT_USER_POPULATE)
      .lean();

    const authorIds = [...new Set(posts.map((p) => idStr(p.author)))];
    const relations = await getRelationsToAuthors(userId, authorIds);
    res.json(posts.map((p) => shapePost(stripBlockedComments(p, hidden), userId, relations)));
  } catch (err) {
    console.error('getSavedPosts:', err);
    res.status(500).json({ error: 'Error obteniendo guardados' });
  }
}

// GET /posts/user/:userId
export async function getPostsByUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const targetId = req.params.userId;
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const hidden = await getHiddenUserIds(userId);
    if (hidden.has(targetId)) { res.json([]); return; }

    const posts = await Post.find({ author: targetId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_POPULATE)
      .populate('comments.user', COMMENT_USER_POPULATE)
      .populate('comments.replies.user', COMMENT_USER_POPULATE)
      .lean();

    const relations = await getRelationsToAuthors(userId, [targetId]);
    res.json(posts.map((p) => shapePost(stripBlockedComments(p, hidden), userId, relations)));
  } catch (err) {
    console.error('getPostsByUser:', err);
    res.status(500).json({ error: 'Error obteniendo publicaciones' });
  }
}

// GET /posts/:id
export async function getPostById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id)
      .populate('author', AUTHOR_POPULATE)
      .populate('comments.user', COMMENT_USER_POPULATE)
      .populate('comments.replies.user', COMMENT_USER_POPULATE)
      .lean();
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    const hidden = await getHiddenUserIds(userId);
    if (hidden.has(idStr((post as any).author))) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    const relations = await getRelationsToAuthors(userId, [idStr((post as any).author)]);
    res.json(shapePost(stripBlockedComments(post, hidden), userId, relations));
  } catch (err) {
    console.error('getPostById:', err);
    res.status(500).json({ error: 'Error obteniendo la publicación' });
  }
}

// GET /posts/:id/engagement
export async function getPostEngagement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const post = await Post.findById(req.params.id)
      .populate('likes', 'name avatar')
      .populate('sharedBy', 'name avatar')
      .populate('reactions.users', 'name avatar')
      .lean();
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    res.json({
      likers: (post as any).likes ?? [],
      sharers: (post as any).sharedBy ?? [],
      reactions: (post as any).reactions ?? [],
      likeCount: (post as any).likes?.length ?? 0,
      reactionCount: ((post as any).reactions ?? []).reduce((n: number, r: any) => n + r.users.length, 0),
      shareCount: (post as any).sharedBy?.length ?? 0,
    });
  } catch (err) {
    console.error('getPostEngagement:', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
}

// POST /posts — crear. Solo `linked.type === "bible"` se acepta del cliente (el
// servidor recalcula título/texto a partir de los versículos); cualquier otro
// `linked` se ignora — los posts automáticos de actividad/oración/material los
// crea `linkedPost.ts`, no este endpoint.
export async function createPost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { content, image, linked } = req.body as { content?: string; image?: string; linked?: any };

    let linkedBible: IPostLinked | undefined;
    if (linked?.type === 'bible' && Array.isArray(linked.verses) && linked.verses.length) {
      const verses = normalizeVerses(linked.verses);
      if (verses.length) {
        linkedBible = {
          type: 'bible',
          refId: `${verses[0].book}:${verses[0].chapter}:${verses[0].verse}`,
          title: passageReference(verses),
          text: passageText(verses),
          version: typeof linked.version === 'string' ? linked.version : undefined,
          verses,
          url: `/bible?ref=${encodeURIComponent(passageReference(verses))}`,
        };
      }
    }

    if (!hasVisibleText(content) && !image && !linkedBible) {
      res.status(400).json({ error: 'No puedes publicar una publicación vacía' });
      return;
    }

    const created = await Post.create({
      author: userId,
      content,
      image,
      isRichText: false,
      ...(linkedBible ? { linked: linkedBible } : {}),
    });

    const populated = await Post.findById(created._id).populate('author', AUTHOR_POPULATE).lean();
    res.status(201).json(populated);
  } catch (err) {
    console.error('createPost:', err);
    res.status(500).json({ error: 'Error creando la publicación' });
  }
}

// PUT /posts/:id — autor o admin. Solo texto.
export async function updatePost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { content } = req.body as { content?: string };
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    if (post.author.toString() !== userId && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para editar esta publicación' });
      return;
    }
    if (!hasVisibleText(content) && !post.image) {
      res.status(400).json({ error: 'La publicación no puede quedar vacía' });
      return;
    }
    post.content = content;
    await post.save();
    res.json({ postId: post._id, content: post.content });
  } catch (err) {
    console.error('updatePost:', err);
    res.status(500).json({ error: 'Error actualizando la publicación' });
  }
}

// DELETE /posts/:id — autor o admin.
export async function deletePost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    if (post.author.toString() !== userId && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta publicación' });
      return;
    }

    // Las imágenes de los comentarios se suben por comentario y no las comparte
    // nadie: se borran sin más.
    const commentUrls: (string | undefined)[] = [];
    for (const c of post.comments) {
      commentUrls.push(c.image);
      for (const r of c.replies) commentUrls.push(r.image);
    }
    const attachment = post.image;

    await Post.findByIdAndDelete(post._id);
    res.json({ ok: true });

    deleteCloudinaryUrls(commentUrls).catch(() => {});
    // El adjunto del post SÍ puede estar compartido: el editor permite mandar un
    // video a publicación, reel e historia a la vez, y los tres apuntan al mismo
    // archivo (se sube una sola vez). Borrarlo a secas dejaba el reel sin video.
    if (attachment) deleteAssetIfUnused({ url: attachment }).catch(() => {});
  } catch (err) {
    console.error('deletePost:', err);
    res.status(500).json({ error: 'Error eliminando la publicación' });
  }
}

// POST /posts/:id/like — toggle simple (❤️/👍 de un toque).
export async function likePost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    const liked = post.likes.some((u) => idStr(u) === userId);
    post.likes = (liked
      ? post.likes.filter((u) => idStr(u) !== userId)
      : [...post.likes, new Types.ObjectId(userId)]) as any;
    await post.save();

    res.json({ likes: post.likes, reactions: post.reactions });
  } catch (err) {
    console.error('likePost:', err);
    res.status(500).json({ error: 'Error al reaccionar' });
  }
}

// PATCH /posts/:id/react — multi-emoji, una reacción por usuario.
export async function reactToPost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { emoji } = req.body as { emoji?: string };
    if (!emoji) { res.status(400).json({ error: 'Falta el emoji' }); return; }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    applyPostReaction(post, emoji, userId);
    await post.save();

    const populated = await Post.findById(post._id)
      .populate('likes', 'name avatar')
      .populate('reactions.users', 'name avatar')
      .lean();
    res.json({ likes: (populated as any)?.likes, reactions: (populated as any)?.reactions });
  } catch (err) {
    console.error('reactToPost:', err);
    res.status(500).json({ error: 'Error al reaccionar' });
  }
}

// POST /posts/:id/save — toggle guardado.
export async function toggleSavePost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    const saved = post.savedBy.some((u) => idStr(u) === userId);
    post.savedBy = (saved
      ? post.savedBy.filter((u) => idStr(u) !== userId)
      : [...post.savedBy, new Types.ObjectId(userId)]) as any;
    await post.save();

    res.json({ saved: !saved, savedCount: post.savedBy.length });
  } catch (err) {
    console.error('toggleSavePost:', err);
    res.status(500).json({ error: 'Error al guardar' });
  }
}

// POST /posts/:id/hide — "no me interesa" (se excluye del feed).
export async function markPostAsNotInterested(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    await User.findByIdAndUpdate(userId, { $addToSet: { notInterestedPosts: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('markPostAsNotInterested:', err);
    res.status(500).json({ error: 'Error al ocultar' });
  }
}

// POST /posts/:id/share/:network
export async function recordShare(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const network = req.params.network as (typeof SHARE_NETWORKS)[number];
    if (!SHARE_NETWORKS.includes(network)) {
      res.status(400).json({ error: 'Red no soportada' });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    post.shareCounts[network] = (post.shareCounts[network] ?? 0) + 1;
    if (!post.sharedBy.some((u) => idStr(u) === userId)) {
      post.sharedBy.push(new Types.ObjectId(userId) as any);
    }
    await post.save();

    res.json({ success: true, shareCounts: post.shareCounts, sharedCount: post.sharedBy.length });
  } catch (err) {
    console.error('recordShare:', err);
    res.status(500).json({ error: 'Error al registrar el compartido' });
  }
}

// ── Comentarios y respuestas ──────────────────────────────────────────────

async function populateComments(postId: Types.ObjectId | string) {
  const post = await Post.findById(postId)
    .populate('comments.user', COMMENT_USER_POPULATE)
    .populate('comments.replies.user', COMMENT_USER_POPULATE)
    .lean();
  return (post as any)?.comments ?? [];
}

// POST /posts/:id/comments
export async function addComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { content, image } = req.body as { content?: string; image?: string };
    if (!hasVisibleText(content) && !image) {
      res.status(400).json({ error: 'El comentario no puede estar vacío' });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }

    post.comments.push({ content, image, user: new Types.ObjectId(userId) } as unknown as IComment);
    await post.save();

    res.status(201).json(await populateComments(post._id));
  } catch (err) {
    console.error('addComment:', err);
    res.status(500).json({ error: 'Error al comentar' });
  }
}

// PATCH /posts/:id/comments/:commentId — dueño del comentario o admin.
export async function editComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { content, image } = req.body as { content?: string; image?: string };

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }

    if (comment.user.toString() !== userId && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para editar este comentario' });
      return;
    }
    if (content !== undefined) comment.content = content;
    if (image !== undefined) comment.image = image;
    comment.updatedAt = new Date();
    await post.save();

    res.json(await populateComments(post._id));
  } catch (err) {
    console.error('editComment:', err);
    res.status(500).json({ error: 'Error al editar el comentario' });
  }
}

// DELETE /posts/:id/comments/:commentId — autor del post, dueño del comentario o admin.
export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }

    const isOwner = comment.user.toString() === userId;
    const isPostAuthor = post.author.toString() === userId;
    if (!isOwner && !isPostAuthor && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' });
      return;
    }

    const image = comment.image;
    comment.deleteOne();
    await post.save();
    if (image) deleteCloudinaryUrls([image]).catch(() => {});

    res.json(await populateComments(post._id));
  } catch (err) {
    console.error('deleteComment:', err);
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
}

// POST /posts/:id/comments/:commentId/replies
export async function addReply(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { content, image } = req.body as { content?: string; image?: string };
    if (!hasVisibleText(content) && !image) {
      res.status(400).json({ error: 'La respuesta no puede estar vacía' });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }

    comment.replies.push({ content, image, user: new Types.ObjectId(userId) });
    await post.save();

    res.status(201).json(await populateComments(post._id));
  } catch (err) {
    console.error('addReply:', err);
    res.status(500).json({ error: 'Error al responder' });
  }
}

// DELETE /posts/:id/comments/:commentId/replies/:replyId
export async function deleteReply(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) { res.status(404).json({ error: 'Respuesta no encontrada' }); return; }

    const isOwner = reply.user.toString() === userId;
    const isPostAuthor = post.author.toString() === userId;
    if (!isOwner && !isPostAuthor && !(await isGlobalAdmin(userId))) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta respuesta' });
      return;
    }

    const image = reply.image;
    reply.deleteOne();
    await post.save();
    if (image) deleteCloudinaryUrls([image]).catch(() => {});

    res.json(await populateComments(post._id));
  } catch (err) {
    console.error('deleteReply:', err);
    res.status(500).json({ error: 'Error al eliminar la respuesta' });
  }
}

// PATCH /posts/:id/comments/:commentId/react
export async function reactToComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { emoji } = req.body as { emoji?: string };
    if (!emoji) { res.status(400).json({ error: 'Falta el emoji' }); return; }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }

    comment.reactions = toggleReaction(comment.reactions, emoji, userId);
    await post.save();

    res.json(await populateComments(post._id));
  } catch (err) {
    console.error('reactToComment:', err);
    res.status(500).json({ error: 'Error al reaccionar' });
  }
}

// PATCH /posts/:id/comments/:commentId/replies/:replyId/react
export async function reactToReply(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { emoji } = req.body as { emoji?: string };
    if (!emoji) { res.status(400).json({ error: 'Falta el emoji' }); return; }

    const post = await Post.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Publicación no encontrada' }); return; }
    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ error: 'Comentario no encontrado' }); return; }
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) { res.status(404).json({ error: 'Respuesta no encontrada' }); return; }

    reply.reactions = toggleReaction(reply.reactions, emoji, userId);
    await post.save();

    res.json(await populateComments(post._id));
  } catch (err) {
    console.error('reactToReply:', err);
    res.status(500).json({ error: 'Error al reaccionar' });
  }
}

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { isGlobalAdmin } from '../services/adminService';

export async function getConversations(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const archived = req.query.archived === 'true';
    const favorite = req.query.favorite === 'true';

    // El admin general ve TODOS los grupos del chat (aunque no sea miembro) además
    // de sus conversaciones propias, para poder moderarlos.
    const admin = await isGlobalAdmin(userId);
    const query: any = admin
      ? { $or: [{ participants: userId }, { isGroup: true }] }
      : { participants: userId };
    if (favorite) {
      query.favoritedBy = userId; // all favorites regardless of archive state
    } else if (archived) {
      query.archivedBy = userId;
    } else {
      query.archivedBy = { $ne: userId };
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'name avatar email lastSeen showLastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'senderId', select: 'name avatar' } })
      .sort({ lastMessageAt: -1 })
      .lean();

    const currentUser = await User.findById(userId).select('blockedUsers').lean();
    const blockedSet = new Set(
      (currentUser?.blockedUsers ?? []).map((id: any) => id.toString())
    );

    const convIds = conversations.map((c) => c._id);
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          senderId: { $ne: new Types.ObjectId(userId) },
          readBy: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
          isDeletedForEveryone: { $ne: true },
        },
      },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map<string, number>(
      unreadAgg.map((u: any) => [u._id.toString(), u.count])
    );

    const result = conversations.map((conv) => {
      const otherUser = (conv.participants as any[]).find(
        (p: any) => p._id.toString() !== userId
      );
      return {
        ...conv,
        isPinned: (conv.pinnedBy ?? []).some((id: any) => id.toString() === userId),
        isArchived: archived,
        isFavorite: (conv.favoritedBy ?? []).some((id: any) => id.toString() === userId),
        isMuted: (conv.mutedBy ?? []).some((id: any) => id.toString() === userId),
        isBlocked: otherUser ? blockedSet.has(otherUser._id.toString()) : false,
        unreadCount: unreadMap.get(conv._id.toString()) ?? 0,
      };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Error obteniendo conversaciones' });
  }
}

async function toggleConvField(
  conversationId: string,
  userId: string,
  field: 'pinnedBy' | 'archivedBy' | 'favoritedBy' | 'mutedBy',
  res: Response
): Promise<void> {
  const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
  if (!conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

  const arr = conv[field] as Types.ObjectId[];
  const isSet = arr.some((id) => id.toString() === userId);

  await Conversation.findByIdAndUpdate(
    conversationId,
    isSet ? { $pull: { [field]: userId } } : { $addToSet: { [field]: userId } }
  );

  const key = field === 'pinnedBy' ? 'pinned' : field === 'archivedBy' ? 'archived' : field === 'favoritedBy' ? 'favorited' : 'muted';
  res.json({ [key]: !isSet });
}

export async function togglePin(req: Request, res: Response) {
  try { await toggleConvField(req.params.id, (req as any).userId, 'pinnedBy', res); }
  catch { res.status(500).json({ error: 'Error al fijar conversación' }); }
}

export async function toggleArchive(req: Request, res: Response) {
  try { await toggleConvField(req.params.id, (req as any).userId, 'archivedBy', res); }
  catch { res.status(500).json({ error: 'Error al archivar conversación' }); }
}

export async function toggleFavorite(req: Request, res: Response) {
  try { await toggleConvField(req.params.id, (req as any).userId, 'favoritedBy', res); }
  catch { res.status(500).json({ error: 'Error al marcar como favorito' }); }
}

export async function toggleMute(req: Request, res: Response) {
  try { await toggleConvField(req.params.id, (req as any).userId, 'mutedBy', res); }
  catch { res.status(500).json({ error: 'Error al silenciar conversación' }); }
}

export async function markAllRead(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const userConvs = await Conversation.find({ participants: userId }).select('_id').lean();
    const convIds = userConvs.map((c) => c._id);
    await Message.updateMany(
      {
        conversationId: { $in: convIds },
        senderId: { $ne: new Types.ObjectId(userId) },
        readBy: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
      },
      { $addToSet: { readBy: new Types.ObjectId(userId) }, $set: { status: 'read' } }
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al marcar como leído' });
  }
}

export async function createOrGetConversation(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId requerido' });
    if (targetUserId === userId) return res.status(400).json({ error: 'No puedes chatear contigo mismo' });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Buscar conversación existente entre ambos
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, targetUserId], $size: 2 },
    }).populate('participants', 'name avatar email lastSeen showLastSeen');

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, targetUserId] });
      conversation = await conversation.populate('participants', 'name avatar email lastSeen showLastSeen');
    }

    res.json(conversation);
  } catch {
    res.status(500).json({ error: 'Error creando conversación' });
  }
}

export async function getMessages(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;
    const { before, limit = '50' } = req.query;

    let conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });
    // El admin general puede leer los mensajes de cualquier grupo para moderarlo.
    if (!conversation && (await isGlobalAdmin(userId))) {
      conversation = await Conversation.findOne({ _id: conversationId, isGroup: true });
    }
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    const query: any = { conversationId };
    if (before) query.createdAt = { $lt: new Date(before as string) };

    const messages = await Message.find(query)
      .populate('senderId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json(messages.reverse());
  } catch {
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
}

// Búsqueda de mensajes dentro de una conversación (todo el historial, no solo
// la página cargada). Devuelve { results, page, total }.
export async function searchMessages(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;
    const { query = '', page = '1', limit = '20' } = req.query as Record<string, string>;

    const term = String(query).trim();
    if (!term) return res.json({ results: [], page: 1, total: 0 });

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    // Búsqueda insensible a mayúsculas/minúsculas y a acentos (á=a, ñ=n…), por
    // coincidencia parcial. Normaliza el término y acepta variantes acentuadas.
    const stripAccents = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const accentMap: Record<string, string> = {
      a: '[aáàäâã]',
      e: '[eéèëê]',
      i: '[iíìïî]',
      o: '[oóòöôõ]',
      u: '[uúùüû]',
      n: '[nñ]',
      c: '[cç]',
    };
    const pattern = [...stripAccents(term)]
      .map((ch) =>
        accentMap[ch] ? accentMap[ch] : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('');
    const rx = new RegExp(pattern, 'i');

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));

    const filter: any = {
      conversationId,
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: userId },
      // Texto por contenido; archivos (documento/imagen) por nombre.
      $or: [{ type: 'text', content: rx }, { fileName: rx }],
    };

    const [results, total] = await Promise.all([
      Message.find(filter)
        .populate('senderId', 'name avatar')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Message.countDocuments(filter),
    ]);

    res.json({ results, page: pageNum, total });
  } catch {
    res.status(500).json({ error: 'Error buscando mensajes' });
  }
}

export async function searchUsers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { q } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.status(400).json({ error: 'Búsqueda mínima de 2 caracteres' });
    }

    const users = await User.find({
      _id: { $ne: userId },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
    })
      .select('name avatar email')
      .limit(20);

    res.json(users);
  } catch {
    res.status(500).json({ error: 'Error buscando usuarios' });
  }
}

export async function getSuggestedUsers(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;

    const existingConvs = await Conversation.find({
      participants: userId,
      isGroup: false,
    }).select('participants').lean();

    const knownIds = new Set<string>([userId.toString()]);
    for (const conv of existingConvs) {
      for (const p of conv.participants as any[]) {
        knownIds.add(p.toString());
      }
    }

    const users = await User.find({ _id: { $nin: Array.from(knownIds) } })
      .select('name avatar email')
      .sort({ createdAt: -1 })
      .limit(15);

    res.json(users);
  } catch {
    res.status(500).json({ error: 'Error obteniendo sugerencias' });
  }
}

export async function getAllUsersSearch(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { q } = req.query;

    const filter: any = { _id: { $ne: userId } };
    if (q && (q as string).trim().length >= 2) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('name avatar email')
      .sort({ name: 1 })
      .limit(40);

    res.json(users);
  } catch {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
}

// Búsqueda GLOBAL de mensajes: recorre todas las conversaciones del usuario y
// devuelve los mensajes de texto (o nombres de archivo) que coinciden con el
// término. Insensible a mayúsculas y acentos. Cada resultado incluye la
// conversación a la que pertenece para poder abrirla desde la barra de búsqueda.
export async function searchAllMessages(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { q = '', limit = '30' } = req.query as Record<string, string>;
    const term = String(q).trim();
    if (term.length < 2) return res.json({ results: [] });

    // Conversaciones del usuario (para acotar la búsqueda y poder mostrarlas).
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name avatar')
      .lean();
    const convIds = conversations.map((c) => c._id);
    if (convIds.length === 0) return res.json({ results: [] });

    // Regex insensible a acentos (á=a, ñ=n…), coincidencia parcial.
    const stripAccents = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const accentMap: Record<string, string> = {
      a: '[aáàäâã]', e: '[eéèëê]', i: '[iíìïî]',
      o: '[oóòöôõ]', u: '[uúùüû]', n: '[nñ]', c: '[cç]',
    };
    const pattern = [...stripAccents(term)]
      .map((ch) => accentMap[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('');
    const rx = new RegExp(pattern, 'i');

    const limitNum = Math.min(50, Math.max(1, Number(limit) || 30));
    const messages = await Message.find({
      conversationId: { $in: convIds },
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: userId },
      $or: [{ type: 'text', content: rx }, { fileName: rx }],
    })
      .populate('senderId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    // Mapa de conversación → datos de visualización (nombre/avatar/grupo).
    const convMap = new Map<string, any>();
    conversations.forEach((c: any) => {
      const other = (c.participants as any[]).find(
        (p) => p._id.toString() !== userId
      );
      convMap.set(c._id.toString(), {
        _id: c._id,
        isGroup: !!c.isGroup,
        name: c.isGroup ? c.groupName || 'Grupo' : other?.name || 'Usuario',
        avatar: c.isGroup ? c.groupAvatar : other?.avatar,
      });
    });

    const results = messages.map((m: any) => ({
      _id: m._id,
      conversationId: m.conversationId,
      content: m.content,
      type: m.type,
      fileName: m.fileName,
      createdAt: m.createdAt,
      senderName: m.senderId?.name,
      conversation: convMap.get(m.conversationId.toString()) || null,
    }));

    res.json({ results });
  } catch {
    res.status(500).json({ error: 'Error buscando mensajes' });
  }
}

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';

export async function getConversations(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const archived = req.query.archived === 'true';
    const favorite = req.query.favorite === 'true';

    const query: any = { participants: userId };
    if (favorite) {
      query.favoritedBy = userId; // all favorites regardless of archive state
    } else if (archived) {
      query.archivedBy = userId;
    } else {
      query.archivedBy = { $ne: userId };
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'name avatar email')
      .populate({ path: 'lastMessage', populate: { path: 'senderId', select: 'name avatar' } })
      .sort({ lastMessageAt: -1 })
      .lean();

    const currentUser = await User.findById(userId).select('blockedUsers').lean();
    const blockedSet = new Set(
      (currentUser?.blockedUsers ?? []).map((id: any) => id.toString())
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
    }).populate('participants', 'name avatar email');

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, targetUserId] });
      conversation = await conversation.populate('participants', 'name avatar email');
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

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });
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

import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';

export async function getConversations(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;

    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name avatar email')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    res.json(conversations);
  } catch {
    res.status(500).json({ error: 'Error obteniendo conversaciones' });
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

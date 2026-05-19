import { Server, Socket } from 'socket.io';
import { verifyToken } from '../services/jwtService';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';

// userId -> Set of socketIds (un usuario puede tener múltiples conexiones)
const onlineUsers = new Map<string, Set<string>>();

function addOnlineUser(userId: string, socketId: string) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId)!.add(socketId);
}

function removeOnlineUser(userId: string, socketId: string) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

export function setupSocketHandlers(io: Server) {
  // Middleware de autenticación Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = verifyToken(token) as { userId: string };
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId as string;
    addOnlineUser(userId, socket.id);

    // Unir al socket a todas sus conversaciones activas
    const conversations = await Conversation.find({ participants: userId }).select('_id');
    conversations.forEach((c) => socket.join(c._id.toString()));

    // Avisar a contactos que está online
    io.emit('user:online', { userId });

    socket.on('message:send', async (data: { conversationId: string; content: string; type?: string; fileName?: string; fileSize?: number }) => {
      try {
        const { conversationId, content, type = 'text', fileName, fileSize } = data;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });
        if (!conversation) return;

        const message = await Message.create({
          conversationId,
          senderId: userId,
          content,
          type,
          fileName,
          fileSize,
          status: 'sent',
          readBy: [userId],
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        });

        const populated = await message.populate('senderId', 'name avatar');

        // Emitir a todos en la room (incluyendo el emisor para confirmar)
        io.to(conversationId).emit('message:new', populated);

        // Marcar como entregado para los participantes online
        const otherParticipants = conversation.participants
          .map((p) => p.toString())
          .filter((p) => p !== userId);

        const anyOnline = otherParticipants.some(isUserOnline);
        if (anyOnline) {
          await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
          io.to(conversationId).emit('message:delivered', { messageId: message._id, conversationId });
        }
      } catch (err) {
        socket.emit('error', { message: 'Error enviando mensaje' });
      }
    });

    socket.on('message:read', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;

        await Message.updateMany(
          { conversationId, senderId: { $ne: userId }, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId }, status: 'read' }
        );

        io.to(conversationId).emit('message:read', { conversationId, readerId: userId });
      } catch {
        // silencioso
      }
    });

    socket.on('message:edit', async (data: { messageId: string; conversationId: string; content: string }) => {
      try {
        const { messageId, conversationId, content } = data;
        const trimmed = content.trim();
        if (!trimmed) return;

        const message = await Message.findOne({ _id: messageId, conversationId, senderId: userId });
        if (!message) return; // solo el autor puede editar

        const updated = await Message.findByIdAndUpdate(
          messageId,
          { content: trimmed, editedAt: new Date() },
          { new: true }
        );

        io.to(conversationId).emit('message:edited', {
          messageId,
          conversationId,
          content: trimmed,
          editedAt: updated?.editedAt,
        });
      } catch {
        socket.emit('error', { message: 'Error editando mensaje' });
      }
    });

    socket.on('message:delete', async (data: { messageId: string; conversationId: string; deleteFor: 'me' | 'everyone' }) => {
      try {
        const { messageId, conversationId, deleteFor } = data;

        const message = await Message.findOne({ _id: messageId, conversationId });
        if (!message) return;

        if (deleteFor === 'everyone') {
          if (message.senderId.toString() !== userId) return; // solo el autor
          await Message.findByIdAndUpdate(messageId, { isDeletedForEveryone: true });
          io.to(conversationId).emit('message:deleted', {
            messageId,
            conversationId,
            deletedForEveryone: true,
          });
        } else {
          await Message.findByIdAndUpdate(messageId, { $addToSet: { deletedFor: userId } });
          // Solo emitir al socket propio
          socket.emit('message:deleted', {
            messageId,
            conversationId,
            deletedForEveryone: false,
            userId,
          });
        }
      } catch {
        socket.emit('error', { message: 'Error eliminando mensaje' });
      }
    });

    socket.on('conversation:join', async (data: { conversationId: string }) => {
      const { conversationId } = data;
      const valid = await Conversation.findOne({ _id: conversationId, participants: userId }).select('_id');
      if (valid) socket.join(conversationId);
    });

    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('typing:start', { userId, conversationId: data.conversationId });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('typing:stop', { userId, conversationId: data.conversationId });
    });

    socket.on('disconnect', () => {
      removeOnlineUser(userId, socket.id);
      if (!isUserOnline(userId)) {
        io.emit('user:offline', { userId, lastSeen: new Date() });
        User.findByIdAndUpdate(userId, { lastLogin: new Date() }).exec();
      }
    });
  });
}

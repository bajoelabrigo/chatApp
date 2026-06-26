import { Server, Socket } from 'socket.io';
import { verifyAnyToken } from '../services/jwtService';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';
import { deleteCloudinaryAsset } from '../services/cloudinaryService';

// userId -> Set of socketIds (un usuario puede tener múltiples conexiones)
const onlineUsers = new Map<string, Set<string>>();

interface ActiveCall {
  callerId: string;
  calleeId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  answeredAt?: Date;
}

const activeCalls = new Map<string, ActiveCall>();

async function saveCallMessage(
  io: Server,
  conversationId: string,
  senderId: string,
  callType: 'audio' | 'video',
  callStatus: 'missed' | 'answered',
  callDuration?: number
) {
  try {
    const message = await Message.create({
      conversationId,
      senderId,
      content: callType,
      type: 'call',
      callStatus,
      callType,
      callDuration,
      status: 'sent',
      readBy: [senderId],
    });
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });
    const populated = await message.populate('senderId', 'name avatar');
    io.to(conversationId).emit('message:new', populated);
  } catch (err) {
    console.error('Error saving call message:', err);
  }
}

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
      const payload = verifyAnyToken(token);
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId as string;
    addOnlineUser(userId, socket.id);

    // Personal room so REST controllers can target this user
    socket.join(`user:${userId}`);

    // Unir al socket a todas sus conversaciones activas
    const conversations = await Conversation.find({ participants: userId }).select('_id participants');
    conversations.forEach((c) => socket.join(c._id.toString()));

    // Tell this socket which contacts are already online
    const participantIds = conversations.flatMap((c) =>
      (c.participants as any[]).map((p) => p.toString()).filter((id) => id !== userId)
    );
    const uniqueIds = [...new Set<string>(participantIds)];
    const onlineNow = uniqueIds.filter((id) => isUserOnline(id));
    if (onlineNow.length > 0) {
      socket.emit('users:online', { userIds: onlineNow });
    }

    // Avisar a contactos que está online (only if user allows it)
    const userDoc = await User.findById(userId).select('privacySettings').lean();
    const showOnline = userDoc?.privacySettings?.showOnlineStatus ?? true;
    if (showOnline) {
      io.emit('user:online', { userId });
    }

    socket.on('message:send', async (data: {
      conversationId: string;
      content: string;
      type?: string;
      fileName?: string;
      fileSize?: number;
      cloudinaryPublicId?: string;
      replyToMessageId?: string;
    }) => {
      try {
        const { conversationId, content, type = 'text', fileName, fileSize, cloudinaryPublicId, replyToMessageId } = data;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });
        if (!conversation) return;

        const otherParticipants = conversation.participants
          .map((p) => p.toString())
          .filter((p) => p !== userId);

        // Block check only applies to 1-on-1 chats
        const blockedBySomeone = !conversation.isGroup && await User.exists({
          _id: { $in: otherParticipants },
          blockedUsers: userId,
        });

        let replyTo: object | undefined;
        if (replyToMessageId) {
          const original = await Message.findOne({ _id: replyToMessageId, conversationId })
            .populate<{ senderId: { name: string; avatar?: string } }>('senderId', 'name avatar');
          if (original) {
            const sender = original.senderId as { name: string; avatar?: string };
            replyTo = {
              messageId: original._id,
              senderName: sender.name,
              senderAvatar: sender.avatar,
              content: original.content,
              type: original.type,
              fileName: original.fileName,
            };
          }
        }

        const message = await Message.create({
          conversationId,
          senderId: userId,
          content,
          type,
          fileName,
          fileSize,
          cloudinaryPublicId: cloudinaryPublicId ?? undefined,
          status: 'sent',
          readBy: [userId],
          replyTo,
        });

        // ¿Primer mensaje del chat? (la conversación aún no tenía lastMessage).
        // `conversation` se leyó arriba ANTES de actualizar lastMessage, así que
        // refleja el estado previo. Sirve para detectar un chat 1:1 nuevo cuyo
        // receptor todavía no lo tiene en su lista.
        const isFirstMessage = !conversation.lastMessage;

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        });

        const populated = await message.populate('senderId', 'name avatar');

        if (blockedBySomeone) {
          // Only echo back to sender — recipient never sees it
          socket.emit('message:new', populated);
          return;
        }

        // Asegura que los sockets de los demás participantes estén en la room de
        // la conversación. Al conectar, un usuario solo se une a las rooms de las
        // conversaciones que YA existían; sin esto, el primer mensaje de un chat
        // nuevo no llega en tiempo real (el chat aparece solo tras refrescar).
        const personalRooms = otherParticipants.map((id) => `user:${id}`);
        if (personalRooms.length > 0) io.in(personalRooms).socketsJoin(conversationId);

        // Si es el primer mensaje de un chat 1:1, el receptor aún no tiene la
        // conversación en su lista. Le enviamos la conversación poblada a su room
        // personal ANTES del mensaje, para que la tarjeta aparezca al instante.
        if (isFirstMessage && !conversation.isGroup) {
          const fullConv = await Conversation.findById(conversationId)
            .populate('participants', 'name avatar email lastSeen showLastSeen')
            .lean();
          if (fullConv) {
            for (const pid of otherParticipants) {
              io.to(`user:${pid}`).emit('conversation:new', fullConv);
            }
          }
        }

        // Emitir a todos en la room (incluyendo el emisor para confirmar)
        io.to(conversationId).emit('message:new', populated);

        // Marcar como entregado para los participantes online
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

        // Only broadcast read receipts if user allows it
        const readUser = await User.findById(userId).select('privacySettings').lean();
        const showReceipts = readUser?.privacySettings?.showReadReceipts ?? true;
        if (showReceipts) {
          io.to(conversationId).emit('message:read', { conversationId, readerId: userId });
        }
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
          await Message.findByIdAndUpdate(messageId, { isDeletedForEveryone: true, reactions: [] });
          // Clean up Cloudinary asset if this was a media message
          if (message.cloudinaryPublicId && message.type !== 'text') {
            deleteCloudinaryAsset(message.cloudinaryPublicId, message.type as any);
          }
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

    socket.on('message:react', async (data: { messageId: string; conversationId: string; emoji: string }) => {
      try {
        const { messageId, conversationId, emoji } = data;
        console.log(`[react] recv userId=${userId} msg=${messageId} conv=${conversationId} emoji=${emoji}`);

        const message = await Message.findOne({ _id: messageId, conversationId });
        if (!message) {
          console.log(`[react] message NOT found: _id=${messageId} conv=${conversationId}`);
          return;
        }

        // Serialise current reactions to plain objects for manipulation
        const reactions: Array<{ emoji: string; users: string[] }> =
          (message.reactions ?? []).map((r) => ({
            emoji: r.emoji,
            users: r.users.map((u) => u.toString()),
          }));

        // Remove user from every other emoji (one reaction per user per message)
        const withoutUser = reactions
          .map((r) => r.emoji === emoji ? r : { ...r, users: r.users.filter((u) => u !== userId) })
          .filter((r) => r.users.length > 0);

        const idx = withoutUser.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const alreadyIn = withoutUser[idx].users.includes(userId);
          if (alreadyIn) {
            withoutUser[idx].users = withoutUser[idx].users.filter((u) => u !== userId);
            if (withoutUser[idx].users.length === 0) withoutUser.splice(idx, 1);
          } else {
            withoutUser[idx].users.push(userId);
          }
        } else {
          withoutUser.push({ emoji, users: [userId] });
        }

        reactions.length = 0;
        reactions.push(...withoutUser);

        await Message.findByIdAndUpdate(messageId, { $set: { reactions } });
        console.log(`[react] emitting to room=${conversationId} reactions=${JSON.stringify(reactions)}`);
        io.to(conversationId).emit('message:reaction', { messageId, conversationId, reactions });
      } catch (err) {
        console.error('[react] ERROR:', err);
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

    // ── Group call (LiveKit signaling) ──────────────────────

    socket.on('call:group:start', async (data: {
      conversationId: string;
      callType: 'audio' | 'video';
    }) => {
      const { conversationId, callType } = data;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isGroup: true,
      }).populate('participants', 'name');
      if (!conversation) return;

      const initiator = await User.findById(userId).select('name');
      const otherParticipants = conversation.participants
        .map((p: any) => p._id.toString())
        .filter((id: string) => id !== userId);

      for (const participantId of otherParticipants) {
        io.to(`user:${participantId}`).emit('call:group:invite', {
          conversationId,
          callType,
          initiatorName: initiator?.name ?? 'Usuario',
          groupName: (conversation as any).groupName ?? 'Grupo',
        });
      }
    });

    // ── WebRTC signaling ────────────────────────────────────

    socket.on('call:initiate', async (data: {
      calleeId: string;
      conversationId: string;
      callType: 'audio' | 'video';
      offer: { type: string; sdp: string };
    }) => {
      const { calleeId, conversationId, callType, offer } = data;

      // Callee already in a call
      const calleeIsBusy = [...activeCalls.values()].some(
        (c) => c.callerId === calleeId || c.calleeId === calleeId
      );
      if (calleeIsBusy) {
        socket.emit('call:busy', {});
        return;
      }

      const caller = await User.findById(userId).select('name avatar');
      const callId = `${userId}_${Date.now()}`;
      activeCalls.set(callId, { callerId: userId, calleeId, conversationId, callType });

      io.to(`user:${calleeId}`).emit('call:incoming', {
        callId,
        callerId: userId,
        callerName: caller?.name ?? 'Usuario',
        callerAvatar: caller?.avatar,
        conversationId,
        callType,
        offer,
      });

      socket.emit('call:initiated', { callId });
    });

    socket.on('call:answer', (data: { callId: string; answer: { type: string; sdp: string } }) => {
      const { callId, answer } = data;
      const call = activeCalls.get(callId);
      if (!call) return;
      call.answeredAt = new Date();
      io.to(`user:${call.callerId}`).emit('call:answered', { callId, answer });
    });

    socket.on('call:ice-candidate', (data: {
      callId: string;
      peerId: string;
      candidate: object;
    }) => {
      io.to(`user:${data.peerId}`).emit('call:ice-candidate', {
        callId: data.callId,
        candidate: data.candidate,
      });
    });

    socket.on('call:end', async (data: { callId: string }) => {
      const call = activeCalls.get(data.callId);
      if (!call) return;
      activeCalls.delete(data.callId);
      const peerId = call.callerId === userId ? call.calleeId : call.callerId;
      io.to(`user:${peerId}`).emit('call:ended', { callId: data.callId });

      const callStatus = call.answeredAt ? 'answered' : 'missed';
      const callDuration = call.answeredAt
        ? Math.round((Date.now() - call.answeredAt.getTime()) / 1000)
        : undefined;
      await saveCallMessage(io, call.conversationId, call.callerId, call.callType, callStatus, callDuration);
    });

    socket.on('call:reject', async (data: { callId: string }) => {
      const call = activeCalls.get(data.callId);
      if (!call) return;
      activeCalls.delete(data.callId);
      io.to(`user:${call.callerId}`).emit('call:rejected', { callId: data.callId });
      await saveCallMessage(io, call.conversationId, call.callerId, call.callType, 'missed');
    });

    // ── Disconnect ──────────────────────────────────────────

    socket.on('disconnect', async () => {
      removeOnlineUser(userId, socket.id);
      if (!isUserOnline(userId)) {
        // End any active call
        for (const [callId, call] of activeCalls.entries()) {
          if (call.callerId === userId || call.calleeId === userId) {
            activeCalls.delete(callId);
            const peerId = call.callerId === userId ? call.calleeId : call.callerId;
            io.to(`user:${peerId}`).emit('call:ended', { callId });
            const callStatus = call.answeredAt ? 'answered' : 'missed';
            const callDuration = call.answeredAt
              ? Math.round((Date.now() - call.answeredAt.getTime()) / 1000)
              : undefined;
            saveCallMessage(io, call.conversationId, call.callerId, call.callType, callStatus, callDuration);
            break;
          }
        }
        const now = new Date();
        User.findByIdAndUpdate(userId, { lastLogin: now, lastSeen: now }).exec();
        const offlineUser = await User.findById(userId).select('privacySettings').lean();
        const showOffline = offlineUser?.privacySettings?.showOnlineStatus ?? true;
        if (showOffline) {
          io.emit('user:offline', { userId, lastSeen: now });
        }
      }
    });
  });
}

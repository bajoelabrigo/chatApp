import { Server, Socket } from 'socket.io';
import { verifyAnyToken } from '../services/jwtService';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';
import { deleteCloudinaryAsset } from '../services/cloudinaryService';
import { isGlobalAdmin } from '../services/adminService';
import { sendWebPushToUsers } from '../services/webPushService';
import { sendExpoPushToUsers } from '../services/pushService';
import { logger } from '../services/logger';

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

// ── Lectura en vivo (guiada por un anfitrión) ──────────────────────────────
// Sesión efímera por grupo (en memoria, como las llamadas): el grupo lee el mismo
// pasaje a la vez y el anfitrión va marcando el versículo que se lee. Si el
// servidor reinicia, las sesiones se pierden — es "en vivo", no persistente.
interface ReadingParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
}
interface ReadingSession {
  groupId: string;
  hostId: string;
  book: string;
  chapter: string;
  version: string;
  currentVerse: number;
  // Versículo cuyas referencias cruzadas está enseñando el anfitrión al grupo
  // (null = panel cerrado). Vive en la sesión, no solo en el evento, para que
  // quien entre a mitad del estudio vea lo mismo que los demás.
  refsVerse: number | null;
  participants: Map<string, ReadingParticipant>;
}
const readingSessions = new Map<string, ReadingSession>();

// Resumen ligero (para el banner del chat) y estado completo (para el lector).
function readingSummary(s: ReadingSession) {
  return {
    groupId: s.groupId,
    hostId: s.hostId,
    book: s.book,
    chapter: s.chapter,
    version: s.version,
    currentVerse: s.currentVerse,
    count: s.participants.size,
  };
}
function readingState(s: ReadingSession) {
  return {
    ...readingSummary(s),
    refsVerse: s.refsVerse,
    participants: [...s.participants.values()],
  };
}

// Quita a un usuario de la sesión de su grupo; si era el anfitrión o queda vacía,
// la termina. Se usa al salir explícitamente y al desconectar.
function leaveReadingSession(io: Server, groupId: string, userId: string) {
  const s = readingSessions.get(groupId);
  if (!s || !s.participants.has(userId)) return;
  s.participants.delete(userId);
  if (s.hostId === userId || s.participants.size === 0) {
    readingSessions.delete(groupId);
    io.to(groupId).emit('reading:ended', { groupId });
  } else {
    io.to(groupId).emit('reading:presence', {
      groupId,
      count: s.participants.size,
      participants: [...s.participants.values()],
    });
  }
}

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
    const populated = await message.populate('senderId', 'name avatar isSocio');
    io.to(conversationId).emit('message:new', populated);
  } catch (err) {
    log.error('No se pudo guardar el mensaje de llamada', err);
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

const log = logger('socket');

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
      caption?: string;
      fileName?: string;
      fileSize?: number;
      cloudinaryPublicId?: string;
      replyToMessageId?: string;
      contactUserId?: string;
      mentions?: string[];
      poll?: { question?: string; options?: string[]; multiple?: boolean };
      bible?: {
        reference?: string;
        version?: string;
        versionName?: string;
        verses?: { book?: string; chapter?: number; verse?: number; text?: string }[];
      };
    }) => {
      try {
        const { conversationId, content, type = 'text', fileName, fileSize, cloudinaryPublicId, replyToMessageId, contactUserId } = data;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });
        if (!conversation) return;

        // Menciones (@) — solo en grupos.
        //
        // Se CRIBAN contra los participantes: el cliente manda ids, y sin este
        // filtro cualquiera podría mencionar (y por tanto notificar) a alguien que
        // ni siquiera está en el grupo. Tampoco tiene sentido mencionarse a uno
        // mismo, así que también se descarta.
        const mentions = conversation.isGroup
          ? [...new Set(data.mentions ?? [])].filter(
              (m) =>
                m !== userId &&
                conversation.participants.some((p) => p.toString() === m)
            )
          : [];

        // Contacto compartido: el cliente solo manda el id; el nombre y el avatar
        // se leen de la base para no confiar en un snapshot manipulable.
        let contact: { userId: string; name: string; avatar?: string } | undefined;
        if (type === 'contact') {
          if (!contactUserId) return;
          const shared = await User.findById(contactUserId).select('name avatar').lean();
          if (!shared) return;
          contact = { userId: contactUserId, name: shared.name, avatar: shared.avatar };
        }

        // Encuesta. Se valida y se NORMALIZA aquí: el cliente podría mandar cero
        // opciones, cien, o venir con los votos ya puestos. La encuesta nace
        // siempre vacía de votos (`votes: []`) — se vota con `poll:vote`, no
        // creándola.
        let poll: { question: string; options: { text: string; votes: [] }[]; multiple: boolean; closed: boolean } | undefined;
        if (type === 'poll') {
          // Solo en GRUPOS. La regla vivía únicamente en la interfaz (el botón no
          // se pinta en un 1:1), que es el sitio donde no se puede hacer cumplir:
          // un cliente modificado podía crear una encuesta en un chat individual.
          if (!conversation.isGroup) return;

          const question = (data.poll?.question ?? '').trim().slice(0, 200);
          const options = (data.poll?.options ?? [])
            .map((o) => String(o ?? '').trim().slice(0, 100))
            .filter(Boolean)
            .slice(0, 12); // más de 12 opciones no se leen en una burbuja

          // Una encuesta sin pregunta o con una sola opción no es una encuesta.
          if (!question || options.length < 2) return;

          poll = {
            question,
            options: options.map((text) => ({ text, votes: [] })),
            multiple: !!data.poll?.multiple,
            closed: false,
          };
        }

        // Pasaje bíblico compartido. Se guarda el TEXTO de los versículos
        // (snapshot) para que la burbuja se lea sin conexión y no dependa de la
        // versión. El cliente manda los versículos ya seleccionados; aquí se
        // normalizan y acotan (no una biblia entera en un mensaje).
        let bible: any;
        if (type === 'bible') {
          const raw = data.bible;
          const verses = (raw?.verses ?? [])
            .map((v) => ({
              book: String(v?.book ?? '').slice(0, 60),
              chapter: Number(v?.chapter),
              verse: Number(v?.verse),
              text: String(v?.text ?? '').slice(0, 2000),
            }))
            .filter(
              (v) => v.book && Number.isFinite(v.chapter) && Number.isFinite(v.verse) && v.text
            )
            .slice(0, 50);
          // Un mensaje bíblico sin versículos no es nada: se descarta (como poll).
          if (!verses.length) return;
          const first = verses[0];
          bible = {
            reference:
              String(raw?.reference ?? '').slice(0, 120) ||
              `${first.book} ${first.chapter}:${first.verse}`,
            version: String(raw?.version ?? '').slice(0, 20),
            versionName: String(raw?.versionName ?? '').slice(0, 60),
            book: first.book,
            chapter: first.chapter,
            verse: first.verse,
            verses,
          };
        }

        // Pie de foto: solo tiene sentido en un archivo (en un texto, el texto ES
        // el `content`). Se recorta como en WhatsApp para que no crezca sin fin.
        const isFileMessage = ['image', 'video', 'audio', 'document'].includes(type);
        const caption = isFileMessage
          ? (data.caption ?? '').trim().slice(0, 1000) || undefined
          : undefined;

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

        // Mensajes temporales: si el grupo tiene una duración configurada (en
        // horas), el mensaje expira y MongoDB lo borra vía índice TTL.
        const expiresAt =
          conversation.tempMessageDuration != null
            ? new Date(Date.now() + conversation.tempMessageDuration * 3600 * 1000)
            : undefined;

        const message = await Message.create({
          conversationId,
          senderId: userId,
          // En un contacto compartido el `content` es el nombre, en una encuesta
          // la pregunta, y en un pasaje la referencia ("Juan 3:16"): así las vistas
          // previas (lista de chats, citas, push) tienen algo que mostrar sin tener
          // que leer `contact`, `poll` ni `bible`.
          content: contact ? contact.name : poll ? poll.question : bible ? bible.reference : content,
          type,
          caption,
          fileName,
          fileSize,
          cloudinaryPublicId: cloudinaryPublicId ?? undefined,
          contact,
          poll,
          bible,
          status: 'sent',
          readBy: [userId],
          replyTo,
          mentions,
          expiresAt,
        });

        // ¿Primer mensaje del chat? (la conversación aún no tenía lastMessage).
        // `conversation` se leyó arriba ANTES de actualizar lastMessage, así que
        // refleja el estado previo. Sirve para detectar un chat 1:1 nuevo cuyo
        // receptor todavía no lo tiene en su lista.
        const isFirstMessage = !conversation.lastMessage;

        // Quien había eliminado el chat "solo para él" vuelve a verlo al llegar un
        // mensaje nuevo (igual que WhatsApp: borrar el chat no bloquea a nadie).
        // Se lee ANTES del update para saber a quién hay que reenviarle la
        // conversación: ya no la tiene en su lista.
        const hiddenFor = ((conversation as any).hiddenBy ?? []).map((id: any) => id.toString());

        await Conversation.findByIdAndUpdate(conversationId, {
          $set: { lastMessage: message._id, lastMessageAt: message.createdAt },
          $pull: { hiddenBy: { $in: conversation.participants } },
        });

        const populated = await message.populate('senderId', 'name avatar isSocio');

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
        // Lo mismo para quien había eliminado el chat de su lista: sin esto, el
        // mensaje llegaría a una conversación que su cliente ya no conoce y no se
        // vería hasta refrescar.
        const needConv = new Set<string>(
          otherParticipants.filter(
            (pid) => hiddenFor.includes(pid) || (isFirstMessage && !conversation.isGroup)
          )
        );
        if (needConv.size > 0) {
          const fullConv = await Conversation.findById(conversationId)
            .populate('participants', 'name avatar email lastSeen showLastSeen isSocio')
            .lean();
          if (fullConv) {
            for (const pid of needConv) {
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

        // 🔔 Web Push (PWA) a los participantes SIN socket conectado (app/pestaña
        // cerrada) — justo cuando el push aporta. Best-effort.
        const offline = otherParticipants.filter((pid) => !isUserOnline(pid));
        if (offline.length) {
          const sender = populated.senderId as unknown as { name?: string; avatar?: string };
          const senderName = sender?.name || 'Nuevo mensaje';
          const preview =
            type !== 'text'
              ? type === 'image'
                ? `📷 ${caption ?? 'Foto'}`
                : type === 'audio'
                ? '🎤 Mensaje de voz'
                : type === 'video'
                ? `🎬 ${caption ?? 'Video'}`
                : type === 'contact'
                ? `👤 ${contact?.name ?? 'Contacto'}`
                : type === 'poll'
                ? `📊 ${poll?.question ?? 'Encuesta'}`
                : type === 'bible'
                ? `📖 ${bible?.reference ?? 'Pasaje bíblico'}`
                : '📎 Archivo'
              : (content || '').trim().slice(0, 80) || 'Nuevo mensaje';
          const groupName = (conversation as any).groupName || 'el grupo';
          const title = conversation.isGroup ? groupName : senderName;
          const pushBody = conversation.isGroup ? `${senderName}: ${preview}` : preview;

          // A quien MENCIONAS se le avisa aparte, con otro texto. Sin esto su push
          // sería idéntico al de cualquier otro mensaje del grupo: se perdería
          // entre los demás, que es justo el problema que la mención resuelve.
          const mentionedOffline = offline.filter((pid) => mentions.includes(pid));

          // SILENCIAR ahora silencia de verdad.
          //
          // `Conversation.mutedBy` existía y lo respetaba la campana de
          // notificaciones, pero el push (nativo y web) NO lo consultaba: quien
          // silenciaba un chat seguía recibiendo cada mensaje en el móvil. Ese era
          // el silencio que no silenciaba nada.
          //
          // Las MENCIONES son la excepción a propósito: silenciar un grupo dice
          // "no me interesa la conversación general", no "no me avises si me
          // hablan a mí". Es lo que hace WhatsApp, y sin esa excepción la mención
          // pierde justo su razón de ser.
          const mutedBy = new Set(
            ((conversation as any).mutedBy ?? []).map((u: any) => u.toString())
          );
          const restOffline = offline.filter(
            (pid) => !mentions.includes(pid) && !mutedBy.has(pid)
          );

          const mentionPush = {
            title: `💬 ${senderName} te mencionó`,
            body: `${groupName}: ${preview}`,
          };

          if (mentionedOffline.length) {
            sendWebPushToUsers(
              mentionedOffline,
              {
                ...mentionPush,
                url: '/chat',
                // `tag` propio: si compartiera el del chat, un mensaje normal
                // posterior REEMPLAZARÍA el aviso de la mención en la bandeja.
                tag: `mention-${conversationId}`,
                icon: sender?.avatar,
                badge: 'chat',
              },
              'messages'
            );
            sendExpoPushToUsers(
              mentionedOffline,
              { ...mentionPush, data: { type: 'chat', conversationId } },
              'messages'
            );
          }

          if (restOffline.length) {
            sendWebPushToUsers(
              restOffline,
              {
                title,
                body: pushBody,
                url: '/chat',
                tag: `chat-${conversationId}`,
                icon: sender?.avatar,
                badge: 'chat',
              },
              'messages'
            );

            // 🔔 Push nativo (Expo) a la app móvil de los participantes offline.
            sendExpoPushToUsers(
              restOffline,
              {
                title,
                body: pushBody,
                data: { type: 'chat', conversationId },
              },
              'messages'
            );
          }
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

        let message = await Message.findOne({ _id: messageId, conversationId, senderId: userId });
        // El admin general puede editar cualquier mensaje de un grupo o de sus
        // propios chats 1:1 (moderación de usuarios y grupos).
        if (!message && (await isGlobalAdmin(userId))) {
          const conv = await Conversation.findOne({
            _id: conversationId,
            $or: [{ isGroup: true }, { participants: userId }],
          }).select('_id');
          if (conv) message = await Message.findOne({ _id: messageId, conversationId });
        }
        if (!message) return; // solo el autor (o el admin general) puede editar

        // En una encuesta, editar el mensaje es editar la PREGUNTA.
        //
        // Antes solo se tocaba `content`, que es lo que leen las vistas previas
        // (lista de chats, push), mientras la burbuja pinta `poll.question`. O sea
        // que el autor corregía la pregunta, la lista mostraba el texto nuevo, la
        // burbuja seguía con el viejo, y la edición parecía no haber hecho nada.
        const esEncuesta = message.type === 'poll' && !!message.poll;

        const updated = await Message.findByIdAndUpdate(
          messageId,
          {
            content: trimmed,
            editedAt: new Date(),
            ...(esEncuesta ? { 'poll.question': trimmed } : {}),
          },
          { new: true }
        );

        io.to(conversationId).emit('message:edited', {
          messageId,
          conversationId,
          content: trimmed,
          editedAt: updated?.editedAt,
          // La encuesta actualizada, para que la burbuja repinte la pregunta.
          ...(esEncuesta ? { poll: updated?.poll } : {}),
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
          let allowed = message.senderId.toString() === userId; // el autor
          // El admin general puede eliminar para todos en grupos o en sus chats 1:1.
          if (!allowed && (await isGlobalAdmin(userId))) {
            const conv = await Conversation.findOne({
              _id: conversationId,
              $or: [{ isGroup: true }, { participants: userId }],
            }).select('_id');
            allowed = !!conv;
          }
          if (!allowed) return;
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

    /**
     * Votar en una encuesta.
     *
     * El voto se aplica con UN update atómico (`$addToSet` / `$pull`), no leyendo
     * el mensaje, modificándolo y guardándolo: en una encuesta votan varios a la
     * vez, y un `findById` + `save()` haría que el último en guardar pisara los
     * votos que llegaron entre medias (lost-update). Es el mismo patrón que ya
     * usáis para el progreso del seminario.
     *
     * Votar la misma opción otra vez la DESMARCA (es lo que espera todo el mundo),
     * y en las encuestas de una sola respuesta se retira el voto anterior.
     */
    socket.on('poll:vote', async (data: { messageId: string; conversationId: string; optionIndex: number }) => {
      try {
        const { messageId, conversationId, optionIndex } = data;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        }).lean();
        if (!conversation) return;

        const message = await Message.findOne({ _id: messageId, conversationId }).lean();
        if (!message || message.type !== 'poll' || !message.poll) return;
        if (message.poll.closed) return; // encuesta cerrada: no se toca

        const idx = Number(optionIndex);
        const options = message.poll.options ?? [];
        if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return;

        const yaVotada = (options[idx].votes ?? []).some((v: any) => v.toString() === userId);

        // Sello de la hora del voto, en un arreglo espejo (`votedAt`) que viaja
        // pegado a `votes`: es lo que enseña "Ver votos" bajo cada nombre. Se
        // mueve SIEMPRE en el mismo update que el voto — si se quedara atrás, la
        // lista mostraría la hora de un voto que ya se retiró.
        const ahora = new Date();

        if (yaVotada) {
          // Desmarcar.
          await Message.updateOne(
            { _id: messageId },
            {
              $pull: {
                [`poll.options.${idx}.votes`]: userId,
                [`poll.options.${idx}.votedAt`]: { user: userId },
              },
            } as any
          );
        } else if (message.poll.multiple) {
          await Message.updateOne(
            { _id: messageId },
            {
              $addToSet: { [`poll.options.${idx}.votes`]: userId },
              $push: { [`poll.options.${idx}.votedAt`]: { user: userId, at: ahora } },
            } as any
          );
        } else {
          // Respuesta única: se retira el voto de las OTRAS opciones y se pone en
          // la elegida, TODO EN UN SOLO update.
          //
          // Antes eran dos ($pull de todas y luego $addToSet en la elegida) y entre
          // ellos había un instante en el que el votante no tenía ningún voto: si
          // otro miembro votaba justo ahí, su `poll:update` llevaba ese estado
          // intermedio y todos veían el recuento bajar y volver a subir. Y si el
          // segundo update fallaba, el voto se perdía del todo.
          //
          // `$pull` y `$addToSet` pueden ir juntos mientras no toquen el MISMO
          // campo — y no lo hacen: de la opción elegida no hay nada que quitar, así
          // que se excluye del $pull.
          const pull: Record<string, unknown> = {};
          options.forEach((_, i) => {
            if (i !== idx) {
              pull[`poll.options.${i}.votes`] = userId;
              pull[`poll.options.${i}.votedAt`] = { user: userId };
            }
          });

          await Message.updateOne({ _id: messageId }, {
            ...(Object.keys(pull).length ? { $pull: pull } : {}),
            $addToSet: { [`poll.options.${idx}.votes`]: userId },
            $push: { [`poll.options.${idx}.votedAt`]: { user: userId, at: ahora } },
          } as any);
        }

        const updated = await Message.findById(messageId).select('poll').lean();
        io.to(conversationId).emit('poll:update', {
          messageId,
          conversationId,
          poll: updated?.poll,
        });

        // 🔔 Aviso al AUTOR de la encuesta: alguien acaba de votarla.
        //
        // Solo al añadir un voto (retirarlo no se avisa: sería un aviso de que
        // ya no hay novedad), nunca a uno mismo, y respetando el silencio del
        // chat. Como en los mensajes, el push nativo/web se manda solo si no
        // tiene socket abierto — si está dentro, las barras ya se le mueven en
        // vivo. La campana de la app lo lista igual (se calcula de `votedAt`).
        const autorId = message.senderId.toString();
        const silenciado = ((conversation as any).mutedBy ?? []).some(
          (u: any) => u.toString() === autorId
        );
        if (!yaVotada && autorId !== userId && !silenciado && !isUserOnline(autorId)) {
          const votante = await User.findById(userId).select('name avatar').lean();
          const nombre = votante?.name || 'Alguien';
          const opcion = options[idx].text;
          const aviso = {
            title: `📊 ${nombre} votó tu encuesta`,
            body: `${opcion} · ${message.poll.question}`.slice(0, 120),
          };
          sendWebPushToUsers(
            [autorId],
            {
              ...aviso,
              url: '/chat',
              // `tag` por encuesta: varios votos seguidos actualizan el mismo
              // aviso en vez de llenar la bandeja.
              tag: `poll-${messageId}`,
              icon: votante?.avatar,
              badge: 'chat',
            },
            'messages'
          );
          sendExpoPushToUsers(
            [autorId],
            { ...aviso, data: { type: 'chat', conversationId } },
            'messages'
          );
        }
      } catch (err) {
        log.error('poll:vote falló', err);
      }
    });

    /**
     * Cerrar una encuesta (deja de admitir votos).
     *
     * Faltaba: `poll.closed` solo se escribía como `false` y no había forma de
     * ponerlo a true, así que todo el código que lo respeta —el guardia de
     * `poll:vote`, el "· cerrada" de las dos burbujas— era inalcanzable. El autor
     * cuadraba los turnos y la gente seguía votando y moviéndoselos.
     *
     * Solo puede cerrarla quien la creó o un admin del grupo: cerrar la encuesta
     * de otro sería quitarle la palabra.
     */
    socket.on('poll:close', async (data: { messageId: string; conversationId: string }) => {
      try {
        const { messageId, conversationId } = data;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        }).lean();
        if (!conversation) return;

        const message = await Message.findOne({ _id: messageId, conversationId }).lean();
        if (!message || message.type !== 'poll' || !message.poll) return;

        const esAutor = message.senderId.toString() === userId;
        const esAdmin = (conversation.admins ?? []).some((a: any) => a.toString() === userId);
        if (!esAutor && !esAdmin) return;

        await Message.updateOne({ _id: messageId }, { $set: { 'poll.closed': true } });

        const updated = await Message.findById(messageId).select('poll').lean();
        io.to(conversationId).emit('poll:update', {
          messageId,
          conversationId,
          poll: updated?.poll,
        });
      } catch (err) {
        log.error('poll:close falló', err);
      }
    });

    socket.on('message:react', async (data: { messageId: string; conversationId: string; emoji: string }) => {
      try {
        const { messageId, conversationId, emoji } = data;
        log.debug(`react recibido userId=${userId} msg=${messageId} conv=${conversationId} emoji=${emoji}`);

        const message = await Message.findOne({ _id: messageId, conversationId });
        if (!message) {
          log.warn(`react sobre un mensaje inexistente: _id=${messageId} conv=${conversationId}`);
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
        log.debug(`react emitido a room=${conversationId} reactions=${JSON.stringify(reactions)}`);
        io.to(conversationId).emit('message:reaction', { messageId, conversationId, reactions });
      } catch (err) {
        log.error('message:react falló', err);
      }
    });

    socket.on('conversation:join', async (data: { conversationId: string }) => {
      const { conversationId } = data;
      let valid = await Conversation.exists({ _id: conversationId, participants: userId });
      // El admin general puede entrar a cualquier grupo aunque no sea miembro.
      if (!valid && (await isGlobalAdmin(userId))) {
        valid = await Conversation.exists({ _id: conversationId, isGroup: true });
      }
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

    // ── Lectura en vivo (guiada por un anfitrión) ───────────

    // Iniciar (o unirse si ya hay una) una sesión de lectura en el grupo.
    socket.on('reading:start', async (data: { groupId: string; book: string; chapter: string; version?: string }) => {
      const { groupId, book, chapter } = data;
      if (!groupId || !book || !chapter) return;
      const member = await Conversation.findOne({ _id: groupId, isGroup: true, participants: userId }).select('_id').lean();
      if (!member) return;

      const me = await User.findById(userId).select('name avatar').lean();
      const participant: ReadingParticipant = { userId, name: me?.name ?? 'Alguien', avatar: me?.avatar ?? null };

      let s = readingSessions.get(groupId);
      if (!s) {
        s = {
          groupId,
          hostId: userId,
          book,
          chapter: String(chapter),
          version: data.version || 'RV1909',
          currentVerse: 1,
          refsVerse: null,
          participants: new Map([[userId, participant]]),
        };
        readingSessions.set(groupId, s);
        // Aviso a todo el grupo (banner "lectura en vivo").
        io.to(groupId).emit('reading:started', readingSummary(s));
      } else {
        s.participants.set(userId, participant);
        io.to(groupId).emit('reading:presence', { groupId, count: s.participants.size, participants: [...s.participants.values()] });
      }
      // Estado completo al que entra (para abrir el lector en el punto actual).
      socket.emit('reading:state', readingState(s));
    });

    // Unirse a la sesión activa del grupo.
    socket.on('reading:join', async (data: { groupId: string }) => {
      const { groupId } = data;
      const s = readingSessions.get(groupId);
      if (!s) { socket.emit('reading:ended', { groupId }); return; }
      const member = await Conversation.findOne({ _id: groupId, isGroup: true, participants: userId }).select('_id').lean();
      if (!member) return;

      const me = await User.findById(userId).select('name avatar').lean();
      s.participants.set(userId, { userId, name: me?.name ?? 'Alguien', avatar: me?.avatar ?? null });
      socket.emit('reading:state', readingState(s));
      io.to(groupId).emit('reading:presence', { groupId, count: s.participants.size, participants: [...s.participants.values()] });
    });

    // El anfitrión marca el versículo que se está leyendo.
    socket.on('reading:verse', (data: { groupId: string; verse: number }) => {
      const s = readingSessions.get(data.groupId);
      if (!s || s.hostId !== userId) return;
      const verse = Number(data.verse);
      if (!Number.isFinite(verse) || verse < 1) return;
      s.currentVerse = verse;
      io.to(data.groupId).emit('reading:verse', { groupId: data.groupId, verse });

      // Con el panel de referencias abierto, éstas SIGUEN al versículo que se
      // está leyendo: el anfitrión lo abre una vez y a partir de ahí cada
      // versículo trae las suyas sin que tenga que pedirlas de nuevo. Se decide
      // aquí (y no en cada cliente) para que el grupo entero vea lo mismo,
      // incluidos los que siguen la lectura desde la app.
      if (s.refsVerse !== null) {
        s.refsVerse = verse;
        io.to(data.groupId).emit('reading:refs', { groupId: data.groupId, verse });
      }
    });

    // El anfitrión enseña al grupo las referencias cruzadas de un versículo
    // (`verse: null` las cierra). Solo él: si cualquiera pudiera cambiarlas,
    // dos personas se pelearían por la pantalla en mitad de una explicación.
    //
    // Solo viaja el NÚMERO del versículo: cada cliente pide las referencias a
    // /bible como ya hacía, y las pinta en la versión que esté leyendo.
    socket.on('reading:refs', (data: { groupId: string; verse: number | null }) => {
      const s = readingSessions.get(data.groupId);
      if (!s || s.hostId !== userId) return;
      const verse = data.verse === null ? null : Number(data.verse);
      if (verse !== null && (!Number.isFinite(verse) || verse < 1)) return;
      s.refsVerse = verse;
      io.to(data.groupId).emit('reading:refs', { groupId: data.groupId, verse });
    });

    // "Amén" — reacción transitoria (no se guarda; solo un destello en vivo).
    socket.on('reading:amen', async (data: { groupId: string }) => {
      const s = readingSessions.get(data.groupId);
      if (!s || !s.participants.has(userId)) return;
      const p = s.participants.get(userId)!;
      io.to(data.groupId).emit('reading:amen', { groupId: data.groupId, userId, name: p.name });
    });

    // Salir de la sesión (participante) o terminarla (si eres el anfitrión).
    socket.on('reading:leave', (data: { groupId: string }) => {
      leaveReadingSession(io, data.groupId, userId);
    });
    socket.on('reading:end', (data: { groupId: string }) => {
      const s = readingSessions.get(data.groupId);
      if (!s || s.hostId !== userId) return;
      readingSessions.delete(data.groupId);
      io.to(data.groupId).emit('reading:ended', { groupId: data.groupId });
    });

    // Al abrir un chat de grupo: saber si hay una sesión activa (para el banner).
    socket.on('reading:status', (data: { groupId: string }) => {
      const s = readingSessions.get(data.groupId);
      socket.emit('reading:status', s ? readingSummary(s) : { groupId: data.groupId, active: false });
    });

    // ── Disconnect ──────────────────────────────────────────

    socket.on('disconnect', async () => {
      removeOnlineUser(userId, socket.id);
      if (!isUserOnline(userId)) {
        // Sacar de cualquier sesión de lectura en vivo (host o participante). Solo
        // al quedar totalmente offline: con varios dispositivos, cerrar uno no debe
        // sacarte de la lectura.
        for (const [gid, s] of readingSessions.entries()) {
          if (s.participants.has(userId)) leaveReadingSession(io, gid, userId);
        }
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

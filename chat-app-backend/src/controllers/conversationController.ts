import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { escapeRegex } from '../lib/regex';
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
    // Chats eliminados "solo para mí": fuera de todas las listas hasta que llegue
    // un mensaje nuevo (message:send limpia la marca).
    query.hiddenBy = { $ne: userId };
    if (favorite) {
      query.favoritedBy = userId; // all favorites regardless of archive state
    } else if (archived) {
      query.archivedBy = userId;
    } else {
      query.archivedBy = { $ne: userId };
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'name avatar email lastSeen showLastSeen isSocio')
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
          // Un mensaje que vacié del chat no puede seguir contando como pendiente.
          deletedFor: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
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
      // "Marcado como no leído" a mano: no hay mensajes pendientes de verdad, así
      // que se fuerza el globo a 1 para que el chat se vea igual que uno con un
      // mensaje sin leer (y entre en el filtro "No leídos").
      const markedUnread = (conv.unreadBy ?? []).some((id: any) => id.toString() === userId);
      const realUnread = unreadMap.get(conv._id.toString()) ?? 0;
      // Si vacié el chat, el último mensaje ya no existe PARA MÍ: la lista no puede
      // seguir enseñando su vista previa (el otro sí lo conserva).
      const lastMsg: any = conv.lastMessage;
      const lastDeletedForMe =
        !!lastMsg &&
        (lastMsg.deletedFor ?? []).some((id: any) => id.toString() === userId);
      return {
        ...conv,
        lastMessage: lastDeletedForMe ? undefined : conv.lastMessage,
        isPinned: (conv.pinnedBy ?? []).some((id: any) => id.toString() === userId),
        isArchived: archived,
        isFavorite: (conv.favoritedBy ?? []).some((id: any) => id.toString() === userId),
        isMuted: (conv.mutedBy ?? []).some((id: any) => id.toString() === userId),
        isBlocked: otherUser ? blockedSet.has(otherUser._id.toString()) : false,
        isUnreadMarked: markedUnread,
        unreadCount: markedUnread ? Math.max(realUnread, 1) : realUnread,
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

// PATCH /conversations/:id/unread — { unread: boolean }.
// true  → marca el chat como no leído (bandera propia, ver Conversation.unreadBy).
// false → lo marca como leído: quita la bandera Y marca los mensajes pendientes.
export async function setUnread(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const unread = req.body?.unread !== false; // por defecto, marcar como NO leído
    const conv = await Conversation.findOne({ _id: req.params.id, participants: userId })
      .select('_id')
      .lean();
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

    if (unread) {
      await Conversation.updateOne({ _id: conv._id }, { $addToSet: { unreadBy: userId } });
    } else {
      await Promise.all([
        Conversation.updateOne({ _id: conv._id }, { $pull: { unreadBy: userId } }),
        Message.updateMany(
          {
            conversationId: conv._id,
            senderId: { $ne: new Types.ObjectId(userId) },
            readBy: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
          },
          { $addToSet: { readBy: new Types.ObjectId(userId) }, $set: { status: 'read' } }
        ),
      ]);
    }

    res.json({ unread });
  } catch {
    res.status(500).json({ error: 'Error al cambiar el estado de lectura' });
  }
}

// Vacía el chat SOLO PARA MÍ: me añade a `deletedFor` de todos sus mensajes (el
// mismo mecanismo que "eliminar mensaje para mí", ya existente). El otro conserva
// la conversación intacta. Devuelve cuántos mensajes se ocultaron.
async function hideAllMessagesFor(conversationId: string, userId: string) {
  const result = await Message.updateMany(
    {
      conversationId,
      deletedFor: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
    },
    { $addToSet: { deletedFor: new Types.ObjectId(userId) } }
  );
  return result.modifiedCount ?? 0;
}

// DELETE /conversations/:id/messages — "Vaciar chat". La conversación sigue en la
// lista, pero sin mensajes para mí.
export async function clearConversation(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const conv = await Conversation.findOne({ _id: req.params.id, participants: userId })
      .select('_id')
      .lean();
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

    const cleared = await hideAllMessagesFor(String(conv._id), userId);
    // Vaciar deja el chat "visto": no tendría sentido dejar pendientes de mensajes
    // que acabo de ocultar.
    await Conversation.updateOne({ _id: conv._id }, { $pull: { unreadBy: userId } });
    res.json({ cleared });
  } catch {
    res.status(500).json({ error: 'Error al vaciar la conversación' });
  }
}

// DELETE /conversations/:id — "Eliminar chat (solo para mí)": vacía y además lo
// saca de mi lista. No borra nada del otro lado ni impide que me vuelvan a
// escribir: si llega un mensaje nuevo, el chat reaparece (ver message:send).
export async function deleteConversationForMe(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const conv = await Conversation.findOne({ _id: req.params.id, participants: userId })
      .select('_id isGroup')
      .lean();
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

    // En un grupo del que sigo siendo miembro, "eliminar el chat" no significa
    // nada: seguiría llegándome cada mensaje y reapareciendo al instante. Igual
    // que WhatsApp: primero se sale del grupo.
    if ((conv as any).isGroup) {
      return res.status(400).json({
        error: 'Para eliminar el chat de un grupo, primero sal del grupo.',
      });
    }

    await hideAllMessagesFor(String(conv._id), userId);
    await Conversation.updateOne(
      { _id: conv._id },
      { $addToSet: { hiddenBy: userId }, $pull: { unreadBy: userId } }
    );
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la conversación' });
  }
}

export async function markAllRead(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const userConvs = await Conversation.find({ participants: userId }).select('_id').lean();
    const convIds = userConvs.map((c) => c._id);
    await Promise.all([
      Message.updateMany(
        {
          conversationId: { $in: convIds },
          senderId: { $ne: new Types.ObjectId(userId) },
          readBy: { $not: { $elemMatch: { $eq: new Types.ObjectId(userId) } } },
        },
        { $addToSet: { readBy: new Types.ObjectId(userId) }, $set: { status: 'read' } }
      ),
      // "Marcar todo como leído" también borra los marcados a mano como no leídos.
      Conversation.updateMany({ _id: { $in: convIds } }, { $pull: { unreadBy: userId } }),
    ]);
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
    }).populate('participants', 'name avatar email lastSeen showLastSeen isSocio');

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, targetUserId] });
      conversation = await conversation.populate('participants', 'name avatar email lastSeen showLastSeen isSocio');
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

    // Abrir el chat deshace el "marcar como no leído" (igual que en WhatsApp).
    // Solo en la primera página: al paginar hacia atrás no se está "abriendo".
    if (!before) {
      await Conversation.updateOne({ _id: conversationId }, { $pull: { unreadBy: userId } });
    }

    const query: any = { conversationId };
    if (before) query.createdAt = { $lt: new Date(before as string) };

    // `-readBy`: es la lista de TODOS los que han leido cada mensaje, y en un
    // grupo grande crece hasta ser la mayor parte del documento. Se vio en el
    // log: con `limit=50` fijo, las paginas pasaban de 79 KB a 216 KB segun se
    // retrocedia, porque los mensajes antiguos los ha leido ya todo el mundo.
    // Ningun cliente lo usa — el doble tic sale de `status`, y los contadores
    // de no leidos de `/conversations`.
    //
    // `.lean()`: no hacen falta documentos de Mongoose, esto solo se serializa.
    // El esquema no tiene virtuals ni transformaciones `toJSON`, asi que el JSON
    // resultante es identico.
    const messages = await Message.find(query)
      .select('-readBy')
      .populate('senderId', 'name avatar isSocio')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

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
        .populate('senderId', 'name avatar isSocio')
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

    // La query NO siempre es un string: `?q=a&q=b` llega como array, y antes se
    // casteaba a `string` a la fuerza (`q as string`), así que `.trim()` reventaba.
    // Se acota además la longitud: nadie busca a alguien con 300 caracteres.
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().slice(0, 60);

    if (q.length < 2) {
      return res.status(400).json({ error: 'Búsqueda mínima de 2 caracteres' });
    }

    // Excluir usuarios bloqueados: los que yo bloqueé y los que me bloquearon a mí.
    const me = await User.findById(userId).select('blockedUsers').lean();
    const myBlocked = (me?.blockedUsers ?? []).map((b: any) => b.toString());

    // `escapeRegex`: lo que escribe el usuario va como LITERAL. Antes entraba
    // crudo, así que buscar "(" devolvía un 500 y un patrón como "(a+)+$" dejaba a
    // MongoDB en backtracking catastrófico — cualquiera podía tumbar el servidor
    // desde el buscador de usuarios.
    const rx = escapeRegex(q);
    const users = await User.find({
      _id: { $ne: userId, $nin: myBlocked },
      blockedUsers: { $ne: userId },
      $or: [
        { name: { $regex: rx, $options: 'i' } },
        { email: { $regex: rx, $options: 'i' } },
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

    // Excluir usuarios que yo bloqueé (se suman a los ya conocidos) y los que me
    // bloquearon a mí (filtro `blockedUsers`).
    const me = await User.findById(userId).select('blockedUsers').lean();
    for (const b of me?.blockedUsers ?? []) knownIds.add((b as any).toString());

    const users = await User.find({
      _id: { $nin: Array.from(knownIds) },
      blockedUsers: { $ne: userId },
    })
      .select('name avatar email')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(users);
  } catch {
    res.status(500).json({ error: 'Error obteniendo sugerencias' });
  }
}

export async function getAllUsersSearch(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    // Igual que en `searchUsers`: la query puede llegar como array, así que se
    // normaliza en vez de castearla a la fuerza.
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().slice(0, 60);

    const me = await User.findById(userId).select('blockedUsers').lean();
    const myBlocked = (me?.blockedUsers ?? []).map((b: any) => b.toString());

    const filter: any = {
      _id: { $ne: userId, $nin: myBlocked },
      blockedUsers: { $ne: userId },
    };
    if (q.length >= 2) {
      // Igual que en la búsqueda: el texto del usuario va ESCAPADO, como literal.
      const rx = escapeRegex(q);
      filter.$or = [
        { name: { $regex: rx, $options: 'i' } },
        { email: { $regex: rx, $options: 'i' } },
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
      .populate('senderId', 'name avatar isSocio')
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

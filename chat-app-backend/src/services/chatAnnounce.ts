import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { getIO } from '../socket/ioSingleton';

// Publica un mensaje de texto en el chat de un grupo desde un controlador REST
// (p. ej. "📖 Empecé un plan para leer juntos"). Es un mensaje normal del
// creador, no un tipo nuevo: así aparece al instante en los dos clientes sin
// tocar el enum de Message (que tiene sus 3 trampas). El formato *negrita* y los
// enlaces los pinta el parser de chat que ya existe.
//
// Los miembros online ya están en la room de la conversación (se unieron al
// conectar, porque el grupo ya existía), así que basta con emitir a la room.
// Best-effort: nunca lanza — un fallo aquí no debe romper la acción que lo
// disparó.
export async function postGroupAnnouncement(
  conversationId: string,
  senderId: string,
  text: string
): Promise<void> {
  try {
    const message = await Message.create({
      conversationId,
      senderId,
      content: text,
      type: 'text',
      status: 'sent',
      readBy: [senderId],
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { lastMessage: message._id, lastMessageAt: message.createdAt },
    });

    const io = getIO();
    if (io) {
      const populated = await message.populate('senderId', 'name avatar');
      io.to(conversationId).emit('message:new', populated);
    }
  } catch (err) {
    console.error('postGroupAnnouncement:', err);
  }
}

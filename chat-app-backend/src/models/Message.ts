import { Schema, model, Document, Types } from 'mongoose';

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'call' | 'contact' | 'poll';

/**
 * Encuesta (tipo `poll`).
 *
 * Nace de lo que los grupos ya hacen a mano: coordinar ayunos, vigilias y escalas
 * de oración contando mensajes ("¿quién puede el jueves de 6 a 7?"). Con la
 * encuesta esa conversación se convierte en una lista.
 *
 * Los votos se guardan DENTRO de la opción (`votes: userId[]`), no en una
 * colección aparte: una encuesta de chat tiene pocas opciones y pocos votantes, y
 * así el mensaje se pinta con lo que ya trae, sin una consulta extra por burbuja.
 *
 * `multiple` decide si se puede marcar más de una opción — para "¿qué días
 * puedes?" es imprescindible; para "¿nos vemos el sábado?", no.
 */
export interface IPollOption {
  text: string;
  votes: Types.ObjectId[];
}

export interface IPoll {
  question: string;
  options: IPollOption[];
  multiple: boolean;
  closed: boolean;
}

/**
 * Contacto compartido (tipo `contact`). Se guarda un snapshot del nombre y el
 * avatar para que la tarjeta siga siendo legible si el usuario cambia su perfil
 * o borra su cuenta; `userId` es lo que usa el botón "Mensaje" para abrir el chat.
 */
export interface ISharedContact {
  userId: Types.ObjectId;
  name: string;
  avatar?: string;
}

export interface IReplyTo {
  messageId: Types.ObjectId;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: MessageType;
  fileName?: string;
}

export interface IReactionEntry {
  emoji: string;
  users: Types.ObjectId[];
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  type: MessageType;
  fileName?: string;
  fileSize?: number;
  cloudinaryPublicId?: string;
  status: MessageStatus;
  readBy: Types.ObjectId[];
  deletedFor: Types.ObjectId[];
  isDeletedForEveryone: boolean;
  editedAt?: Date;
  callStatus?: 'missed' | 'answered';
  callType?: 'audio' | 'video';
  callDuration?: number;
  contact?: ISharedContact;
  poll?: IPoll;
  replyTo?: IReplyTo;
  reactions?: IReactionEntry[];
  // Usuarios mencionados con @ en el texto (solo grupos).
  //
  // Se guardan los IDS, no los nombres: un nombre puede cambiar, y buscar
  // "@Pedro" en el texto para saber a quién avisar fallaría con dos Pedros o con
  // un nombre que contenga espacios. El texto conserva "@Pedro" para leerse; esta
  // lista es la verdad de a quién se mencionó.
  mentions: Types.ObjectId[];
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'audio', 'document', 'call', 'contact', 'poll'], default: 'text' },
    fileName: { type: String },
    fileSize: { type: Number },
    cloudinaryPublicId: { type: String },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isDeletedForEveryone: { type: Boolean, default: false },
    editedAt: { type: Date },
    callStatus: { type: String, enum: ['missed', 'answered'] },
    callType: { type: String, enum: ['audio', 'video'] },
    callDuration: { type: Number },
    contact: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      avatar: { type: String },
    },
    // Encuesta. Los votos viven dentro de cada opción: pocas opciones y pocos
    // votantes, así que la burbuja se pinta con lo que ya trae el mensaje.
    poll: {
      type: new Schema<IPoll>(
        {
          question: { type: String, required: true },
          options: [
            {
              _id: false,
              text: { type: String, required: true },
              votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            },
          ],
          multiple: { type: Boolean, default: false },
          closed: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    replyTo: {
      messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
      senderName: { type: String },
      senderAvatar: { type: String },
      content: { type: String },
      type: { type: String },
      fileName: { type: String },
    },
    reactions: [{
      emoji: { type: String, required: true },
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    }],
    // Mencionados con @ (solo grupos). Se guardan los IDS: el nombre puede
    // cambiar, y rebuscar "@Pedro" en el texto fallaría con dos Pedros.
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Mensajes temporales: si el grupo tiene `tempMessageDuration`, se fija una
    // fecha de expiración y MongoDB borra el mensaje automáticamente (índice TTL).
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });
// TTL: borra el documento cuando `expiresAt` queda en el pasado. Los mensajes
// sin `expiresAt` (chats normales) nunca expiran.
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Message = model<IMessage>('Message', MessageSchema);

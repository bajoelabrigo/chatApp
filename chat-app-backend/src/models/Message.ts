import { Schema, model, Document, Types } from 'mongoose';

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'call' | 'contact' | 'poll' | 'bible';

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
export interface IPollVoteStamp {
  user: Types.ObjectId;
  at: Date;
}

export interface IPollOption {
  text: string;
  votes: Types.ObjectId[];
  /**
   * Cuándo votó cada uno esta opción. Va en un arreglo APARTE y no dentro de
   * `votes` porque `votes` es la verdad del recuento y se manipula con
   * operadores atómicos (`$addToSet` / `$pull` por valor escalar); con objetos
   * ahí dentro, `$addToSet` dejaría de deduplicar (dos sellos con hora distinta
   * son dos elementos distintos) y cada doble toque contaría dos veces.
   *
   * Es opcional: las encuestas de antes de "Ver votos" no lo tienen, y la lista
   * de votantes se pinta igual, solo que sin la hora.
   */
  votedAt?: IPollVoteStamp[];
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

/**
 * Pasaje bíblico compartido (tipo `bible`). Se guarda el TEXTO de los versículos
 * (snapshot), no solo la referencia: así la burbuja se lee sin pedir nada al
 * servidor y funciona sin conexión, y no depende de que la versión siga estando.
 * `book`/`chapter`/`verse` son del primer versículo, para el botón "Abrir en la
 * Biblia" (deep link) y el resaltado al llegar.
 */
export interface IBibleVerseRef {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface IBibleShare {
  reference: string;   // "Juan 3:16-17"
  version: string;     // id de versión: "RV1909"
  versionName: string; // "Reina Valera 1909"
  book: string;        // libro del primer versículo (deep link)
  chapter: number;
  verse: number;
  verses: IBibleVerseRef[];
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
  /** Pie de foto: el texto que acompaña a una imagen/video/documento. Va DENTRO
   *  de la misma burbuja (como WhatsApp), no como un mensaje de texto aparte.
   *  En los mensajes de media el `content` es la URL del archivo, así que el
   *  texto necesita su propio campo. */
  caption?: string;
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
  bible?: IBibleShare;
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
    type: { type: String, enum: ['text', 'image', 'audio', 'video', 'document', 'call', 'contact', 'poll', 'bible'], default: 'text' },
    caption: { type: String },
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
              votedAt: [
                {
                  _id: false,
                  user: { type: Schema.Types.ObjectId, ref: 'User' },
                  at: { type: Date, default: Date.now },
                },
              ],
            },
          ],
          multiple: { type: Boolean, default: false },
          closed: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Pasaje bíblico compartido. Guarda el texto de los versículos (snapshot) para
    // que la burbuja se lea sin conexión y no dependa de la versión.
    bible: {
      type: new Schema<IBibleShare>(
        {
          reference: { type: String, required: true },
          version: { type: String, required: true },
          versionName: { type: String, default: '' },
          book: { type: String, required: true },
          chapter: { type: Number, required: true },
          verse: { type: Number, required: true },
          verses: [
            {
              _id: false,
              book: { type: String, required: true },
              chapter: { type: Number, required: true },
              verse: { type: Number, required: true },
              text: { type: String, required: true },
            },
          ],
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

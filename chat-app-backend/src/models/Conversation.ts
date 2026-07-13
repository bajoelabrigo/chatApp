import { Schema, model, Document, Types } from 'mongoose';

export interface IGroupPermissions {
  membersCanSend: boolean;
  membersCanAddMembers: boolean;
  membersCanInvite: boolean;
  requireAdminApproval: boolean;
}

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  pinnedBy: Types.ObjectId[];
  archivedBy: Types.ObjectId[];
  favoritedBy: Types.ObjectId[];
  mutedBy: Types.ObjectId[];
  // "Marcar como no leído": bandera por usuario, NO se toca `Message.readBy`.
  // Quitar al usuario de `readBy` marcaría el chat como pendiente, pero también
  // le borraría al REMITENTE el doble check azul de sus mensajes. Se limpia sola
  // al abrir la conversación.
  unreadBy: Types.ObjectId[];
  // "Eliminar chat (solo para mí)": la conversación desaparece de MI lista, pero
  // sigue existiendo para el otro. Al llegar un mensaje nuevo se quita la marca y
  // el chat reaparece (igual que WhatsApp: borrar el chat no impide que te escriban).
  hiddenBy: Types.ObjectId[];
  // Group fields
  isGroup: boolean;
  groupName?: string;
  groupAvatar?: string;
  admins: Types.ObjectId[];
  permissions: IGroupPermissions;
  tempMessageDuration: number | null;
  // ¿Puede encontrarse este grupo desde "Descubrir grupos"?
  //
  // Por defecto NO (false): los grupos que ya existen se crearon con la
  // expectativa de ser privados, y sus peticiones de oración suelen ser muy
  // íntimas. Es el admin quien decide exponerlo. Hasta ahora solo se entraba a un
  // grupo si un admin te metía o por un enlace compartido; no había forma de
  // encontrarlos, y por eso los grupos no crecían.
  isDiscoverable: boolean;
  // Descripción corta que se ve en la lista de descubrir ("qué es este grupo").
  groupDescription?: string;
  // Solicitudes de ingreso pendientes de aprobación (grupos con requireAdminApproval).
  pendingMembers: { userId: Types.ObjectId; requestedAt: Date }[];
  // Miembros aprobados recientemente (para derivar la notificación "fuiste aceptado").
  approvedMembers: { userId: Types.ObjectId; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date },
    pinnedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    archivedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    favoritedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    mutedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    unreadBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    hiddenBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isGroup: { type: Boolean, default: false },
    groupName: { type: String },
    groupAvatar: { type: String },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    permissions: {
      membersCanSend: { type: Boolean, default: true },
      membersCanAddMembers: { type: Boolean, default: true },
      membersCanInvite: { type: Boolean, default: true },
      requireAdminApproval: { type: Boolean, default: false },
    },
    tempMessageDuration: { type: Number, default: null },
    // Los grupos que YA existen se crearon esperando ser privados: por defecto no
    // se descubren. El admin decide exponerlos.
    isDiscoverable: { type: Boolean, default: false },
    groupDescription: { type: String, maxlength: 200 },
    pendingMembers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        requestedAt: { type: Date, default: Date.now },
      },
    ],
    approvedMembers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export const Conversation = model<IConversation>('Conversation', ConversationSchema);

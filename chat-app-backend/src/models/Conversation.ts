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
  // Group fields
  isGroup: boolean;
  groupName?: string;
  groupAvatar?: string;
  admins: Types.ObjectId[];
  permissions: IGroupPermissions;
  tempMessageDuration: number | null;
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
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export const Conversation = model<IConversation>('Conversation', ConversationSchema);

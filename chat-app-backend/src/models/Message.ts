import { Schema, model, Document, Types } from 'mongoose';

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'call';

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
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'audio', 'document', 'call'], default: 'text' },
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
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = model<IMessage>('Message', MessageSchema);

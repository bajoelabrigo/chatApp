import { Schema, model, Document, Types } from 'mongoose';

interface PrayingEntry {
  userId: Types.ObjectId;
  prayedAt: Date;
  message?: string;
}

export interface IPrayerRequest extends Document {
  groupId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  isAnonymous: boolean;
  imageUrl?: string;
  cloudinaryPublicId?: string;
  deadline?: Date;
  prayingUsers: PrayingEntry[];
  isAnswered: boolean;
  answeredAt?: Date;
  answeredNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PrayerRequestSchema = new Schema<IPrayerRequest>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 500 },
    isAnonymous: { type: Boolean, default: false },
    prayingUsers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        prayedAt: { type: Date, default: Date.now },
        message: { type: String, maxlength: 200 },
        _id: false,
      },
    ],
    imageUrl: { type: String },
    cloudinaryPublicId: { type: String },
    deadline: { type: Date },
    isAnswered: { type: Boolean, default: false },
    answeredAt: { type: Date },
    answeredNote: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

PrayerRequestSchema.index({ groupId: 1, createdAt: -1 });

export const PrayerRequest = model<IPrayerRequest>('PrayerRequest', PrayerRequestSchema);

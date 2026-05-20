import { Schema, model, Document, Types } from 'mongoose';

export interface ScheduleSlot {
  dayOfWeek: number; // 0 (Sun) – 6 (Sat)
  hour: number;      // 0–23
  minute: number;    // 0 or 30
}

export interface IActivityCommitment extends Document {
  activityId: Types.ObjectId;
  groupId: Types.ObjectId;
  userId: Types.ObjectId;
  schedule: ScheduleSlot[];
  timezone: string;
  expoPushToken?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleSlotSchema = new Schema<ScheduleSlot>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    hour: { type: Number, required: true, min: 0, max: 23 },
    minute: { type: Number, required: true, enum: [0, 30] },
  },
  { _id: false }
);

const ActivityCommitmentSchema = new Schema<IActivityCommitment>(
  {
    activityId: { type: Schema.Types.ObjectId, ref: 'GroupActivity', required: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    schedule: { type: [ScheduleSlotSchema], required: true, validate: [(arr: any[]) => arr.length >= 1, 'Debe tener al menos un horario'] },
    timezone: { type: String, required: true },
    expoPushToken: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ActivityCommitmentSchema.index({ activityId: 1, userId: 1 }, { unique: true });
ActivityCommitmentSchema.index({ isActive: 1 });

export const ActivityCommitment = model<IActivityCommitment>('ActivityCommitment', ActivityCommitmentSchema);

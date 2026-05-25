import { Schema, model, Document, Types } from 'mongoose';
import type { ActivityType } from './GroupActivity';

export interface IPersonalCommitment extends Document {
  userId: Types.ObjectId;
  type: ActivityType;
  emoji: string;
  name: string;
  proposito?: string;
  daysOfWeek: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  notificationsEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalCommitmentSchema = new Schema<IPersonalCommitment>(
  {
    userId:               { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type:                 { type: String, enum: ['ayuno', 'vigilia', 'cilicio', 'escala_oracion', 'bible_reading', 'evangelism', 'prayer', 'fasting'], required: true },
    emoji:                { type: String, required: true },
    name:                 { type: String, required: true },
    proposito:            { type: String, maxlength: 200 },
    daysOfWeek:           { type: [Number], required: true, validate: [(arr: number[]) => arr.length >= 1, 'Debe seleccionar al menos un día'] },
    startHour:            { type: Number, required: true, min: 0, max: 23 },
    startMinute:          { type: Number, required: true, enum: [0, 30] },
    endHour:              { type: Number, required: true, min: 0, max: 23 },
    endMinute:            { type: Number, required: true, enum: [0, 30] },
    notificationsEnabled: { type: Boolean, default: true },
    isActive:             { type: Boolean, default: true },
  },
  { timestamps: true }
);

PersonalCommitmentSchema.index({ userId: 1, isActive: 1 });

export const PersonalCommitment = model<IPersonalCommitment>('PersonalCommitment', PersonalCommitmentSchema);

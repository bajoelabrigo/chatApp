import { Schema, model, Document, Types } from 'mongoose';

export type ActivityType = 'ayuno' | 'vigilia' | 'cilicio' | 'escala_oracion' | 'bible_reading' | 'evangelism' | 'prayer' | 'fasting';

export const ACTIVITY_META: Record<ActivityType, { emoji: string; defaultName: string }> = {
  ayuno:          { emoji: '🤲', defaultName: 'Ayuno' },
  vigilia:        { emoji: '🏆', defaultName: 'Vigilia' },
  cilicio:        { emoji: '⛓️', defaultName: 'Cilicio' },
  escala_oracion: { emoji: '🙏', defaultName: 'Escala de Oración' },
  bible_reading:  { emoji: '📖', defaultName: 'Lectura Bíblica' },
  evangelism:     { emoji: '🗣️', defaultName: 'Evangelismo' },
  // deprecated — kept for backward compatibility with existing data
  prayer:  { emoji: '🙏', defaultName: 'Oración' },
  fasting: { emoji: '🤲', defaultName: 'Ayuno' },
};

export interface IGroupActivity extends Document {
  groupId: Types.ObjectId;
  createdBy: Types.ObjectId;
  type: ActivityType;
  emoji: string;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupActivitySchema = new Schema<IGroupActivity>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['ayuno', 'vigilia', 'cilicio', 'escala_oracion', 'bible_reading', 'evangelism', 'prayer', 'fasting'], required: true },
    emoji: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

GroupActivitySchema.index({ groupId: 1, type: 1 }, { unique: true });

export const GroupActivity = model<IGroupActivity>('GroupActivity', GroupActivitySchema);

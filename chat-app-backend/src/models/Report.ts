import { Schema, model, Document, Types } from 'mongoose';

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  targetId: Types.ObjectId;
  // El tipo del interface estaba desincronizado del enum (decía solo 'group').
  targetType: 'group' | 'user' | 'reel';
  reason?: string;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['group', 'user', 'reel'], required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Report = model<IReport>('Report', ReportSchema);

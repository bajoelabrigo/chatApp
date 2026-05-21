import { Schema, model, Document, Types } from 'mongoose';

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  targetId: Types.ObjectId;
  targetType: 'group';
  reason?: string;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['group', 'user'], required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Report = model<IReport>('Report', ReportSchema);

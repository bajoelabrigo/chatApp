import { Schema, model, Document, Types } from 'mongoose';

export interface IOffering extends Document {
  userId: Types.ObjectId;
  paypalOrderId?: string;
  paypalSubscriptionId?: string;
  type: 'one_time' | 'subscription';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const OfferingSchema = new Schema<IOffering>(
  {
    userId:                { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paypalOrderId:         { type: String },
    paypalSubscriptionId:  { type: String },
    type:                  { type: String, enum: ['one_time', 'subscription'], required: true },
    amount:                { type: Number, required: true },
    currency:              { type: String, default: 'usd' },
    status:                { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending' },
  },
  { timestamps: true }
);

export const Offering = model<IOffering>('Offering', OfferingSchema);

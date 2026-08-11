import { Schema, model, Document, Types } from 'mongoose';

// Mapea la colección compartida `connectionrequests` (misma base que `holy_app`
// — ver `connectionModel.js`). Sin `collection:` override: la pluralización
// default de "ConnectionRequest" ya da "connectionrequests", igual que la web.
export interface IConnectionRequest extends Document {
  sender: Types.ObjectId;
  recipient: Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const ConnectionRequestSchema = new Schema<IConnectionRequest>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export const ConnectionRequest = model<IConnectionRequest>('ConnectionRequest', ConnectionRequestSchema);

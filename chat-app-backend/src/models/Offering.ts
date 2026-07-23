import { Schema, model, Document, Types } from 'mongoose';

export interface IOffering extends Document {
  userId?: Types.ObjectId;
  paypalOrderId?: string;
  paypalSubscriptionId?: string;
  type: 'one_time' | 'subscription';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  // Origen del registro: PayPal (flujo automático) o manual (lo anotó un admin
  // por un pago recibido fuera de la app: transferencia, efectivo, Zelle…).
  source?: 'paypal' | 'manual';
  method?: string;      // efectivo | transferencia | paypal | zelle | otro
  note?: string;
  donorName?: string;   // ofrenda de alguien SIN cuenta (externo)
  donorEmail?: string;
  registeredBy?: Types.ObjectId; // admin que la anotó
  receivedAt?: Date;    // fecha real del ingreso (puede diferir de createdAt)
  createdAt: Date;
  updatedAt: Date;
}

const OfferingSchema = new Schema<IOffering>(
  {
    // Opcional: las ofrendas manuales de personas externas no tienen usuario.
    userId:                { type: Schema.Types.ObjectId, ref: 'User', index: true },
    paypalOrderId:         { type: String },
    paypalSubscriptionId:  { type: String },
    type:                  { type: String, enum: ['one_time', 'subscription'], required: true },
    amount:                { type: Number, required: true },
    currency:              { type: String, default: 'usd' },
    status:                { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending' },
    source:                { type: String, enum: ['paypal', 'manual'], default: 'paypal' },
    method:                { type: String },
    note:                  { type: String },
    donorName:             { type: String },
    donorEmail:            { type: String },
    registeredBy:          { type: Schema.Types.ObjectId, ref: 'User' },
    receivedAt:            { type: Date },
  },
  { timestamps: true }
);

export const Offering = model<IOffering>('Offering', OfferingSchema);

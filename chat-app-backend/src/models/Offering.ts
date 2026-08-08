import { Schema, model, Document, Types } from 'mongoose';

export interface IOffering extends Document {
  userId?: Types.ObjectId;
  paypalOrderId?: string;
  // Id de la CAPTURA de PayPal (no de la orden). Sin él un reembolso no se puede
  // casar con su ofrenda: el webhook de reembolso habla de capturas.
  paypalCaptureId?: string;
  paypalSubscriptionId?: string;
  // Id del cobro RECURRENTE de una suscripción (evento clásico PAYMENT.SALE.*,
  // uno por cada mes). El primer mes se reclama sobre la Offering creada al
  // activarse; los meses siguientes crean una fila nueva con este id como
  // clave de idempotencia (PayPal reenvía webhooks).
  paypalSaleId?: string;
  type: 'one_time' | 'subscription';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  // Comisión que PayPal retuvo de este cobro (centavos). El ingreso NETO real
  // es amount - refundedAmount - feeAmount: PayPal nunca deposita el bruto.
  feeAmount?: number;
  // Devuelto por PayPal (centavos). El ingreso neto es amount - refundedAmount,
  // así un reembolso PARCIAL también cuadra.
  refundedAmount?: number;
  refundedAt?: Date;
  // En contabilidad no se borra: se ANULA. Sigue visible, fuera de los totales.
  voided?: boolean;
  voidReason?: string;
  voidedAt?: Date;
  voidedBy?: Types.ObjectId;
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
    paypalCaptureId:       { type: String, index: true },
    paypalSubscriptionId:  { type: String },
    paypalSaleId:          { type: String, index: true, unique: true, sparse: true },
    type:                  { type: String, enum: ['one_time', 'subscription'], required: true },
    amount:                { type: Number, required: true },
    currency:              { type: String, default: 'usd' },
    status:                { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'], default: 'pending' },
    feeAmount:             { type: Number, default: 0 },
    refundedAmount:        { type: Number, default: 0 },
    refundedAt:            { type: Date },
    voided:                { type: Boolean, default: false },
    voidReason:            { type: String },
    voidedAt:              { type: Date },
    voidedBy:              { type: Schema.Types.ObjectId, ref: 'User' },
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

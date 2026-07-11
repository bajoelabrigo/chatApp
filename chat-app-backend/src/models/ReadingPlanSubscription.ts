import { Schema, model, Document, Types } from 'mongoose';

// Suscripción de un usuario a un plan de lectura (feature #2). El catálogo de
// planes es generado (ver src/lib/readingPlans.ts); aquí solo guardamos el
// progreso y los ajustes del recordatorio por usuario.

export interface ICustomPlanDef {
  title: string;
  bookStart: number;
  bookEnd: number;
  days: number;
}

export interface IReadingPlanSubscription extends Document {
  user: Types.ObjectId;
  planKey: string;
  custom?: ICustomPlanDef; // presente solo en planes personalizados
  startDate: Date;
  timezone: string;
  reminderEnabled: boolean;
  reminderHour: number;   // 0–23 (hora local)
  reminderMinute: number; // 0–59
  completedDays: number[]; // días (1-based) marcados como leídos
  lastRemindedOn: string;  // 'YYYY-MM-DD' local — evita recordatorios duplicados
  createdAt: Date;
  updatedAt: Date;
}

const CustomPlanSchema = new Schema<ICustomPlanDef>(
  {
    title: { type: String, default: 'Mi plan' },
    bookStart: { type: Number, required: true },
    bookEnd: { type: Number, required: true },
    days: { type: Number, required: true },
  },
  { _id: false }
);

const ReadingPlanSubscriptionSchema = new Schema<IReadingPlanSubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planKey: { type: String, required: true },
    custom: { type: CustomPlanSchema, default: undefined },
    startDate: { type: Date, required: true, default: Date.now },
    timezone: { type: String, default: 'UTC' },
    reminderEnabled: { type: Boolean, default: true },
    reminderHour: { type: Number, default: 7, min: 0, max: 23 },
    reminderMinute: { type: Number, default: 0, min: 0, max: 59 },
    completedDays: { type: [Number], default: [] },
    lastRemindedOn: { type: String, default: '' },
  },
  { timestamps: true }
);

// Un usuario no puede suscribirse dos veces al mismo plan.
ReadingPlanSubscriptionSchema.index({ user: 1, planKey: 1 }, { unique: true });

export const ReadingPlanSubscription = model<IReadingPlanSubscription>(
  'ReadingPlanSubscription',
  ReadingPlanSubscriptionSchema
);

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
  // Plan de GRUPO: la suscripción sigue siendo de UN usuario (su progreso, su
  // recordatorio, su zona horaria), pero queda ligada a un grupo. Lo que
  // comparten los miembros es el plan y la `startDate`, y de ahí que todos vayan
  // por el mismo día — quien se une tarde NO empieza por el día 1, se alinea con
  // el grupo (ver subscribePlan). Sin grupo (undefined) = plan personal, como
  // hasta ahora.
  group?: Types.ObjectId;
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
    group: { type: Schema.Types.ObjectId, ref: 'Conversation', default: undefined },
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

// Un usuario no puede suscribirse dos veces al mismo plan. Esto vale también
// para los de grupo: si ya seguías "Juan en 21 días" por tu cuenta y el grupo lo
// empieza, tu suscripción se LIGA al grupo (no se duplica). A cambio, no se
// puede seguir el mismo plan en dos grupos a la vez, que es una rareza que no
// compensa el índice extra.
ReadingPlanSubscriptionSchema.index({ user: 1, planKey: 1 }, { unique: true });

// Los planes de un grupo (para la vista de progreso de los miembros).
ReadingPlanSubscriptionSchema.index({ group: 1, planKey: 1 });

export const ReadingPlanSubscription = model<IReadingPlanSubscription>(
  'ReadingPlanSubscription',
  ReadingPlanSubscriptionSchema
);

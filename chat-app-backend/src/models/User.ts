import { Schema, model, Document, Types } from 'mongoose';

export interface INotificationSettings {
  messages: boolean;
  prayerRequests: boolean;
  activityReminders: boolean;
  // Preferencias por categoría de push web (PWA). Gestionadas desde la web.
  posts?: boolean;
  materials?: boolean;
  // Versículo del día (#8): push diario a las 8:00 hora local. Activo por
  // defecto; se apaga desde la propia tarjeta o los ajustes.
  dailyVerse?: boolean;
  // Directos ("Fulano está en vivo 🔴"). Los manda el backend de la web, pero la
  // preferencia vive aquí, con el resto: activa por defecto.
  live?: boolean;
}

export interface IPrivacySettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  showLastSeen: boolean;
}

export interface IUser extends Document {
  googleId?: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  password?: string;
  authProvider: 'google' | 'email';
  emailVerified: boolean;
  verificationCode?: string;
  verificationCodeExpiry?: Date;
  resetCode?: string;
  resetCodeExpiry?: Date;
  blockedUsers: Types.ObjectId[];
  expoPushToken?: string;
  // Suscripciones Web Push (PWA de holyholyholy.es). Colección compartida: la web
  // las crea; este backend las lee para notificar chat/actividades/oración de grupo.
  webPushSubscriptions?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    ua?: string;
    createdAt?: Date;
  }[];
  notificationSettings: INotificationSettings;
  privacySettings: IPrivacySettings;
  // Zona horaria IANA del usuario ("Europe/Madrid"). La mandan los clientes al
  // pedir el versículo del día; el cron la usa para enviar el push a las 8:00
  // LOCALES de cada uno. Sin ella se asume UTC.
  timezone?: string;
  // Último día (YYYY-MM-DD local) en que se le envió el versículo: evita
  // duplicados si el proceso se reinicia dentro del mismo minuto.
  lastDailyVerseOn?: string;
  lastSeen?: Date;
  lastNotificationsSeen?: Date;
  // Notificaciones derivadas (chat unificado) marcadas como leídas / eliminadas.
  // Se guarda el `at` para que un item reaparezca si su timestamp se vuelve más
  // reciente que el marcado (p.ej. un chat eliminado recibe un mensaje nuevo).
  readNotifications?: { id: string; at: Date }[];
  dismissedNotifications?: { id: string; at: Date }[];
  isActiveSubscriber?: boolean;
  lastOfferingAt?: Date;
  // Socio: acceso a materiales gratis + insignia junto al nombre. Se activa
  // manualmente (admin web) o automáticamente al suscribirse a la ofrenda
  // mensual (ver paypalService.handleSubscriptionActivated). Campo compartido
  // con la web (misma colección).
  isSocio?: boolean;
  socioSince?: Date;
  // Ofrenda mensual del socio (USD). Desde $20 = materiales gratis; menos = solo insignia.
  socioAmount?: number;
  // Modal de bienvenida socio pendiente de mostrar (transición false→true).
  socioWelcomePending?: boolean;
  // Socio MANUAL (sin suscripción PayPal): recibe recordatorios de pago. La web
  // gestiona estos campos; aquí solo se leen (base compartida).
  socioManual?: boolean;
  socioNextPaymentDate?: Date;
  socioLastPaymentDate?: Date;
  socioPaymentReminder?: boolean; // aviso de pago activo → modal/banner
  socioOverdue?: boolean;
  socioReminderStage?: number;
  socioPayments?: { date: Date; amount: number }[];
  createdAt: Date;
  lastLogin: Date;
  // ── Campos espejo para compatibilidad con la web (misma colección) ──
  isVerified?: boolean;      // espejo de emailVerified
  profilePicture?: string;   // espejo de avatar
}

const UserSchema = new Schema<IUser>(
  {
    googleId:              { type: String, sparse: true, unique: true },
    email:                 { type: String, required: true, unique: true },
    name:                  { type: String, required: true },
    avatar:                { type: String },
    bio:                   { type: String, maxlength: 150 },
    password:              { type: String },
    authProvider:          { type: String, enum: ['google', 'email'], default: 'google' },
    emailVerified:         { type: Boolean, default: false },
    verificationCode:      { type: String },
    verificationCodeExpiry:{ type: Date },
    resetCode:             { type: String },
    resetCodeExpiry:       { type: Date },
    lastLogin:             { type: Date, default: Date.now },
    blockedUsers:          [{ type: Schema.Types.ObjectId, ref: 'User' }],
    expoPushToken:         { type: String },
    webPushSubscriptions: [
      {
        _id: false,
        endpoint: { type: String },
        keys: { p256dh: String, auth: String },
        ua: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    notificationSettings: {
      messages:           { type: Boolean, default: true },
      prayerRequests:     { type: Boolean, default: true },
      activityReminders:  { type: Boolean, default: true },
      posts:              { type: Boolean, default: true },
      materials:          { type: Boolean, default: true },
      dailyVerse:         { type: Boolean, default: true },
      live:               { type: Boolean, default: true },
    },
    timezone:              { type: String },
    lastDailyVerseOn:      { type: String },
    privacySettings: {
      showOnlineStatus:   { type: Boolean, default: true },
      showReadReceipts:   { type: Boolean, default: true },
      showLastSeen:       { type: Boolean, default: true },
    },
    lastSeen:              { type: Date },
    lastNotificationsSeen: { type: Date },
    readNotifications:     [{ id: String, at: Date, _id: false }],
    dismissedNotifications:[{ id: String, at: Date, _id: false }],
    isActiveSubscriber:    { type: Boolean, default: false },
    lastOfferingAt:        { type: Date },
    isSocio:               { type: Boolean, default: false },
    socioSince:            { type: Date },
    socioAmount:           { type: Number, default: 0 },
    socioWelcomePending:   { type: Boolean, default: false },
    // Socio manual (recordatorios de pago) — los gestiona la web; aquí se leen.
    socioManual:           { type: Boolean, default: false },
    socioNextPaymentDate:  { type: Date },
    socioLastPaymentDate:  { type: Date },
    socioPaymentReminder:  { type: Boolean, default: false },
    socioOverdue:          { type: Boolean, default: false },
    socioReminderStage:    { type: Number, default: 0 },
    socioPayments:         [{ date: Date, amount: Number, _id: false }],
    // Campos espejo de la web (se mantienen sincronizados con los hooks de abajo)
    isVerified:            { type: Boolean, default: false },
    profilePicture:        { type: String },
  },
  { timestamps: true, strict: false }
);

// Mantener sincronizados los campos equivalentes web <-> móvil al guardar un documento
UserSchema.pre('save', function (next) {
  if (this.isModified('emailVerified')) this.isVerified = this.emailVerified;
  else if (this.isModified('isVerified')) this.emailVerified = !!this.isVerified;

  if (this.isModified('avatar') && this.avatar) this.profilePicture = this.avatar;
  else if (this.isModified('profilePicture') && this.profilePicture) this.avatar = this.profilePicture;
  next();
});

// Igual para las actualizaciones por query (findByIdAndUpdate / findOneAndUpdate)
UserSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  const update = (this.getUpdate() || {}) as Record<string, any>;
  const set = (update.$set ?? update) as Record<string, any>;
  if (set && typeof set === 'object') {
    if (set.avatar !== undefined) set.profilePicture = set.avatar;
    else if (set.profilePicture !== undefined) set.avatar = set.profilePicture;
    if (set.emailVerified !== undefined) set.isVerified = set.emailVerified;
    else if (set.isVerified !== undefined) set.emailVerified = set.isVerified;
  }
  next();
});

export const User = model<IUser>('User', UserSchema);

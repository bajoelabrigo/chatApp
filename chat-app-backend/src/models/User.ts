import { Schema, model, Document, Types } from 'mongoose';

export interface INotificationSettings {
  messages: boolean;
  prayerRequests: boolean;
  activityReminders: boolean;
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
  notificationSettings: INotificationSettings;
  privacySettings: IPrivacySettings;
  lastSeen?: Date;
  lastNotificationsSeen?: Date;
  isActiveSubscriber?: boolean;
  lastOfferingAt?: Date;
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
    notificationSettings: {
      messages:           { type: Boolean, default: true },
      prayerRequests:     { type: Boolean, default: true },
      activityReminders:  { type: Boolean, default: true },
    },
    privacySettings: {
      showOnlineStatus:   { type: Boolean, default: true },
      showReadReceipts:   { type: Boolean, default: true },
      showLastSeen:       { type: Boolean, default: true },
    },
    lastSeen:              { type: Date },
    lastNotificationsSeen: { type: Date },
    isActiveSubscriber:    { type: Boolean, default: false },
    lastOfferingAt:        { type: Date },
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

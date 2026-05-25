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
  isActiveSubscriber?: boolean;
  lastOfferingAt?: Date;
  createdAt: Date;
  lastLogin: Date;
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
    isActiveSubscriber:    { type: Boolean, default: false },
    lastOfferingAt:        { type: Date },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', UserSchema);

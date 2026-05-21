import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  googleId?: string;
  email: string;
  name: string;
  avatar?: string;
  password?: string;
  authProvider: 'google' | 'email';
  emailVerified: boolean;
  verificationCode?: string;
  verificationCodeExpiry?: Date;
  resetCode?: string;
  resetCodeExpiry?: Date;
  blockedUsers: Types.ObjectId[];
  expoPushToken?: string;
  createdAt: Date;
  lastLogin: Date;
}

const UserSchema = new Schema<IUser>(
  {
    googleId:              { type: String, sparse: true, unique: true },
    email:                 { type: String, required: true, unique: true },
    name:                  { type: String, required: true },
    avatar:                { type: String },
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
  },
  { timestamps: true }
);

export const User = model<IUser>('User', UserSchema);

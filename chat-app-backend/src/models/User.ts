import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
  blockedUsers: Types.ObjectId[];
  expoPushToken?: string;
  createdAt: Date;
  lastLogin: Date;
}

const UserSchema = new Schema<IUser>(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String },
    lastLogin: { type: Date, default: Date.now },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    expoPushToken: { type: String },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', UserSchema);

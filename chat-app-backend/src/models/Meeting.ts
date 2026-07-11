import { Schema, model, Document, Types } from 'mongoose';
import { randomInt } from 'crypto';

export interface IMeeting extends Document {
  code: string;
  title: string;
  host: Types.ObjectId;
  scheduledAt?: Date;
  lobbyEnabled: boolean;
  status: 'open' | 'ended';
  endedAt?: Date;
  admitted: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledAt: { type: Date },
    lobbyEnabled: { type: Boolean, default: true },
    status: { type: String, enum: ['open', 'ended'], default: 'open' },
    endedAt: { type: Date },
    admitted: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Código estilo Meet: abc-defg-hij. Sin vocales para no formar palabras y sin
// caracteres ambiguos (l/i/o) al dictarlo por voz.
const ALPHABET = 'bcdfghjkmnpqrstvwxyz';

function block(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function generateMeetingCode(): string {
  return `${block(3)}-${block(4)}-${block(3)}`;
}

export const roomNameFor = (code: string) => `meet_${code}`;

export const Meeting = model<IMeeting>('Meeting', MeetingSchema);

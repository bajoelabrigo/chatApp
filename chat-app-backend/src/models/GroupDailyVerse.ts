import { Schema, model, Document, Types } from 'mongoose';

// Reacciones del "versículo del día" en el chat de un grupo. El versículo NO se
// guarda (es determinista por día y versión: lo resuelve `dailyVerseFor`); aquí
// solo viven las reacciones, agrupadas por grupo + día. Una reacción por usuario
// (como las de un mensaje): volver a tocar el mismo emoji la quita, otro la
// reemplaza.

export interface IDailyVerseReaction {
  user: Types.ObjectId;
  emoji: string;
}

export interface IGroupDailyVerse extends Document {
  groupId: Types.ObjectId;
  dateKey: string; // 'YYYY-MM-DD' (día local del grupo, ver el controlador)
  reactions: IDailyVerseReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupDailyVerseSchema = new Schema<IGroupDailyVerse>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    dateKey: { type: String, required: true },
    reactions: [
      {
        _id: false,
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        emoji: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

// Un solo documento por grupo y día.
GroupDailyVerseSchema.index({ groupId: 1, dateKey: 1 }, { unique: true });

export const GroupDailyVerse = model<IGroupDailyVerse>(
  'GroupDailyVerse',
  GroupDailyVerseSchema
);

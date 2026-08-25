import { Schema, model, Document, Types } from 'mongoose';

// Reels e Historias (cortos verticales ≤60 s, estilo Instagram/Facebook).
//
// - `kind: 'story'`  → desaparece 24 h después de crearse (TTL index sobre
//   `expiresAt`; el filtro de lectura también lo respeta por si el borrado
//   automático aún no corrió).
// - `kind: 'reel'`   → permanente, en el feed vertical.
//
// Un reel viene de UNO de dos orígenes:
// - video propio subido (videoUrl + cloudinaryPublicId), o
// - un enlace de YouTube (youtubeVideoId + youtubeTitle; el cliente lo
//   reproduce con un WebView del embed, y `thumbUrl` es la miniatura).
export interface IReel extends Document {
  authorId: Types.ObjectId;
  kind: 'reel' | 'story';
  caption?: string;
  durationSeconds?: number; // ≤ 60
  // Video subido
  videoUrl?: string;
  cloudinaryPublicId?: string;
  // Video de YouTube
  youtubeVideoId?: string;
  youtubeTitle?: string;
  thumbUrl?: string;
  likes: Types.ObjectId[];
  views: { userId: Types.ObjectId; at: Date }[];
  comments: { userId: Types.ObjectId; text: string; at: Date }[];
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReelSchema = new Schema<IReel>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['reel', 'story'], required: true, index: true },
    caption: { type: String, maxlength: 300, trim: true },
    durationSeconds: { type: Number, min: 1, max: 60 },
    videoUrl: { type: String },
    cloudinaryPublicId: { type: String },
    youtubeVideoId: { type: String },
    youtubeTitle: { type: String, maxlength: 200 },
    thumbUrl: { type: String },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    views: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    comments: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, maxlength: 1000, trim: true },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    // Historias: caducan 24 h después de publicarse (TTL). Los reels no lo
    // llevan y viven para siempre.
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const Reel = model<IReel>('Reel', ReelSchema);

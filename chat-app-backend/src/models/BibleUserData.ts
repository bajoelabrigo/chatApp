import { Schema, model, Document, Types } from 'mongoose';

// Datos personales de la Biblia por usuario (favoritos, resaltados, notas).
// Antes vivían solo en localStorage (web) / AsyncStorage (móvil) y se perdían al
// cambiar de dispositivo. Al compartir web y móvil la misma base `chatapp`, este
// modelo los sincroniza entre ambos clientes. La clave lógica de cada versículo
// es `id = "{book}:{chapter}:{verse}"` (misma que ya usan los dos clientes).

export interface IBibleFavorite {
  id: string;
  book: string;
  chapter: string;
  verse: string;
  text: string;
}

export interface IBibleHighlight {
  id: string;
  book: string;
  chapter: string;
  verse: string;
  color: string;
  updatedAt: Date;
}

export interface IBibleAnnotation {
  id: string;
  book: string;
  chapter: string;
  verse: string;
  note: string;
  updatedAt: Date;
}

export interface IBibleUserData extends Document {
  user: Types.ObjectId;
  favorites: IBibleFavorite[];
  highlights: IBibleHighlight[];
  annotations: IBibleAnnotation[];
  createdAt: Date;
  updatedAt: Date;
}

const FavoriteSchema = new Schema<IBibleFavorite>(
  {
    id: { type: String, required: true },
    book: { type: String, default: '' },
    chapter: { type: String, default: '' },
    verse: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: false }
);

const HighlightSchema = new Schema<IBibleHighlight>(
  {
    id: { type: String, required: true },
    book: { type: String, default: '' },
    chapter: { type: String, default: '' },
    verse: { type: String, default: '' },
    color: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AnnotationSchema = new Schema<IBibleAnnotation>(
  {
    id: { type: String, required: true },
    book: { type: String, default: '' },
    chapter: { type: String, default: '' },
    verse: { type: String, default: '' },
    note: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BibleUserDataSchema = new Schema<IBibleUserData>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    favorites: { type: [FavoriteSchema], default: [] },
    highlights: { type: [HighlightSchema], default: [] },
    annotations: { type: [AnnotationSchema], default: [] },
  },
  { timestamps: true }
);

export const BibleUserData = model<IBibleUserData>('BibleUserData', BibleUserDataSchema);

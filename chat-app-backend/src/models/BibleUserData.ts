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
  // Etiquetas del versículo ("Promesa", "Mandato"…). Viven en el favorito
  // porque la clave es la misma (`book:chapter:verse`): etiquetar un versículo
  // implica guardarlo en favoritos, y así las notas del mismo versículo pueden
  // mostrar sus etiquetas sin duplicar el dato.
  tags: string[];
  updatedAt: Date;
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

// Lápida (tombstone) de un borrado. Antes el merge era una UNIÓN, así que si
// borrabas un favorito en el móvil y luego sincronizaba la web —que todavía
// tenía su copia local— el favorito RESUCITABA. Ahora cada borrado deja
// constancia con su fecha: en el merge, un item solo sobrevive si su `updatedAt`
// es POSTERIOR a la lápida (es decir, si se volvió a crear después de borrarlo).
export type BibleItemKind = 'favorite' | 'highlight' | 'annotation';

export interface IBibleDeletion {
  id: string;   // "{book}:{chapter}:{verse}"
  kind: BibleItemKind;
  at: Date;
}

// ── Memorización (repaso espaciado) ─────────────────────────
//
// Un versículo que el usuario quiere aprenderse. `level` es el escalón del
// repaso: cada acierto sube uno (y el siguiente repaso se aleja), cada fallo
// vuelve al principio. Los intervalos viven en el controlador (MEMORIZE_STEPS);
// aquí solo se guarda el escalón y CUÁNDO toca repasarlo.
export interface IBibleMemorize {
  id: string; // "{book}:{chapter}:{verse}"
  book: string;
  chapter: string;
  verse: string;
  text: string;
  level: number; // 0 = recién añadido; al superar el último escalón, "aprendido"
  dueAt: Date;   // cuándo vuelve a tocar
  reviews: number;
  addedAt: Date;
}

// ── Racha de lectura ────────────────────────────────────────
//
// `lastDay` es la fecha LOCAL del usuario ('YYYY-MM-DD'), no un Date: la racha va
// de días naturales, y en Madrid y en Lima el día no cambia a la vez. Guardar un
// instante UTC haría que leer a las 23:30 en Lima contara como el día siguiente.
export interface IBibleReadingStreak {
  lastDay: string;
  current: number;
  longest: number;
  totalDays: number;
}

export interface IBibleUserData extends Document {
  user: Types.ObjectId;
  favorites: IBibleFavorite[];
  highlights: IBibleHighlight[];
  annotations: IBibleAnnotation[];
  deletions: IBibleDeletion[];
  memorize: IBibleMemorize[];
  streak: IBibleReadingStreak;
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
    tags: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now },
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

const DeletionSchema = new Schema<IBibleDeletion>(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: ['favorite', 'highlight', 'annotation'], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MemorizeSchema = new Schema<IBibleMemorize>(
  {
    id: { type: String, required: true },
    book: { type: String, default: '' },
    chapter: { type: String, default: '' },
    verse: { type: String, default: '' },
    text: { type: String, default: '' },
    level: { type: Number, default: 0 },
    dueAt: { type: Date, default: Date.now }, // recién añadido = toca hoy
    reviews: { type: Number, default: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StreakSchema = new Schema<IBibleReadingStreak>(
  {
    lastDay: { type: String, default: '' },
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },
  },
  { _id: false }
);

const BibleUserDataSchema = new Schema<IBibleUserData>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    favorites: { type: [FavoriteSchema], default: [] },
    highlights: { type: [HighlightSchema], default: [] },
    annotations: { type: [AnnotationSchema], default: [] },
    deletions: { type: [DeletionSchema], default: [] },
    memorize: { type: [MemorizeSchema], default: [] },
    streak: { type: StreakSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const BibleUserData = model<IBibleUserData>('BibleUserData', BibleUserDataSchema);

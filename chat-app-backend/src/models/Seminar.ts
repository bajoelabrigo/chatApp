import { Schema, model, Document, Types } from 'mongoose';

// Mapea la colección compartida `activities` (misma base que `holy_app` — ver
// `activityModel.js`). Un "seminario" es un Activity con `seminar.enabled`.
// `collection: 'activities'` es OBLIGATORIO: la pluralización default de
// "Seminar" daría "seminars", que no es la colección real.
export interface ISeminarFile {
  url?: string;
  name?: string;
  format?: string;
  size?: string;
  materialId?: Types.ObjectId;
  uploadedAt?: Date;
}

export interface ISeminarTask {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  fileUrl?: string;
  fileName?: string;
  fileFormat?: string;
  fileSize?: string;
  message?: string;
  studentComment?: string;
  feedback?: string;
  status: 'pendiente' | 'completo' | 'incompleto' | 'enviado';
  submittedAt: Date;
}

export interface IStudentProgress {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  completedClasses: Types.ObjectId[];
  certificate?: { code?: string; issuedAt?: Date };
  tasks: ISeminarTask[];
}

export interface ISeminarClass {
  _id: Types.ObjectId;
  title: string;
  youtubeUrl: string;
  order: number;
  duration?: string;
  image?: string;
  materials: ISeminarFile[];
  material?: ISeminarFile;
  assignment?: ISeminarFile;
}

export interface IActivityMaterial {
  url: string;
  name: string;
  format: string;
  uploadedAt: Date;
  size: string;
}

export interface ISeminar extends Document {
  title: string;
  description?: string;
  coverImage?: string;
  type: 'oracion' | 'ayuno' | 'estudio' | 'vigilia' | 'evangelismo';
  startDate: Date;
  endDate?: Date;
  createdBy: Types.ObjectId;
  participants: { user: Types.ObjectId; petition?: Types.ObjectId }[];
  materials: IActivityMaterial[];
  seminar: {
    enabled: boolean;
    classes: ISeminarClass[];
    studentProgress: IStudentProgress[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const SeminarFileSchema = new Schema<ISeminarFile>(
  {
    url: { type: String },
    name: { type: String },
    format: { type: String },
    size: { type: String },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SeminarTaskSchema = new Schema<ISeminarTask>({
  classId: { type: Schema.Types.ObjectId },
  fileUrl: { type: String },
  fileName: { type: String },
  fileFormat: { type: String },
  fileSize: { type: String },
  message: { type: String },
  studentComment: { type: String },
  feedback: { type: String },
  status: { type: String, enum: ['pendiente', 'completo', 'incompleto', 'enviado'], default: 'enviado' },
  submittedAt: { type: Date, default: Date.now },
});

const StudentProgressSchema = new Schema<IStudentProgress>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  completedClasses: [{ type: Schema.Types.ObjectId }],
  certificate: {
    code: { type: String },
    issuedAt: { type: Date },
  },
  tasks: [SeminarTaskSchema],
});

const SeminarClassSchema = new Schema<ISeminarClass>({
  title: { type: String, required: true },
  youtubeUrl: { type: String, required: true },
  order: { type: Number, required: true },
  duration: { type: String },
  image: { type: String },
  materials: [SeminarFileSchema],
  material: SeminarFileSchema,
  assignment: SeminarFileSchema,
});

const SeminarSchema = new Schema<ISeminar>(
  {
    title: { type: String, required: true },
    description: { type: String },
    coverImage: { type: String },
    type: { type: String, enum: ['oracion', 'ayuno', 'estudio', 'vigilia', 'evangelismo'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [
      {
        _id: false,
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        petition: { type: Schema.Types.ObjectId },
      },
    ],
    materials: [
      {
        _id: false,
        url: { type: String, required: true },
        name: { type: String, required: true },
        format: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        size: { type: String, required: true },
      },
    ],
    seminar: {
      enabled: { type: Boolean, default: false },
      classes: [SeminarClassSchema],
      studentProgress: [StudentProgressSchema],
    },
  },
  { timestamps: true, collection: 'activities' }
);

export const Seminar = model<ISeminar>('Seminar', SeminarSchema);

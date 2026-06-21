import { Schema, model, Document, Types } from 'mongoose';

// Mapea la colección `materials` (la administra holy-backend; aquí solo se lee
// para la app y las notificaciones). Solo los campos que la app necesita.
export interface IMaterial extends Document {
  title: string;
  slug: string;
  description?: string;
  features?: string[];
  tags?: string[];
  coverImage?: string;
  thumbnail?: string;
  files?: { url: string; fileName?: string; fileType?: string; fileSize?: number }[];
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  price: number;
  payWhatYouWant: boolean;
  published: boolean;
  order: number;
  salesCount: number;
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: '' },
    features: [{ type: String }],
    tags: [{ type: String }],
    coverImage: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    files: [
      {
        url: { type: String },
        fileName: { type: String },
        fileType: { type: String },
        fileSize: { type: Number, default: 0 },
      },
    ],
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileType: { type: String, default: '' },
    price: { type: Number, default: 0 },
    payWhatYouWant: { type: Boolean, default: true },
    published: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'materials' }
);

export const Material = model<IMaterial>('Material', MaterialSchema);

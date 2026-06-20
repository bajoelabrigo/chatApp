import { Schema, model, Document, Types } from 'mongoose';

// Colección compartida `material_views`: registra que un usuario ya vio/descargó
// un material (apaga el push/banner). La escriben web (holy-backend) y app.
export interface IMaterialView extends Document {
  userId: Types.ObjectId;
  materialId: Types.ObjectId;
  viewedAt: Date;
  downloaded: boolean;
}

const MaterialViewSchema = new Schema<IMaterialView>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    viewedAt: { type: Date, default: Date.now },
    downloaded: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'material_views' }
);

MaterialViewSchema.index({ userId: 1, materialId: 1 }, { unique: true });

export const MaterialView = model<IMaterialView>('MaterialView', MaterialViewSchema);

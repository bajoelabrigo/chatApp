import type { ISeminarClass, ISeminarFile } from '../models/Seminar';

// Espejo de `holy_app/backend/utils/seminarFiles.js` (`classMaterials`) — al
// tocar las reglas, editar los dos. Prioriza `materials[]`; si está vacío, cae
// al campo legacy `material` (un solo archivo).
export function classMaterials(cls: Partial<ISeminarClass> | any): ISeminarFile[] {
  if (Array.isArray(cls?.materials) && cls.materials.length) {
    return cls.materials.filter((m: ISeminarFile) => m?.url);
  }
  return cls?.material?.url ? [cls.material] : [];
}

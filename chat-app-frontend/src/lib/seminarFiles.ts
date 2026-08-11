import type { SeminarClass, SeminarFile } from '../services/seminarService';

// Espejo de `chat-app-backend/src/utils/seminarFiles.ts` (y de `seminarFiles.js`
// en la web) — al tocar las reglas, editar los tres. Prioriza `materials[]`; si
// está vacío, cae al campo legacy `material` (un solo archivo).
export function classMaterials(cls: Partial<SeminarClass> | undefined | null): SeminarFile[] {
  if (Array.isArray(cls?.materials) && cls.materials.length) {
    return cls.materials.filter((m) => m?.url);
  }
  return cls?.material?.url ? [cls.material] : [];
}

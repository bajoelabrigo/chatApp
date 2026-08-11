import type { ISeminar, ISeminarClass } from '../models/Seminar';

// Espejo de `holy_app/backend/utils/seminarAccess.js`. `isAdmin` se resuelve
// aparte (vía `isGlobalAdmin()`) en vez de leerse síncrono de `user.role` como
// hace la web, porque en este backend es una consulta async.
export function hasSeminarAccess(activity: ISeminar, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const owner = activity.createdBy?.toString();
  if (owner && owner === userId) return true;
  return activity.participants.some((p) => p.user?.toString() === userId);
}

export function lockClasses(classes: ISeminarClass[], hasAccess: boolean): any[] {
  return classes.map((c) => {
    const obj = (c as any).toObject ? (c as any).toObject() : { ...c };
    if (hasAccess) return { ...obj, locked: false };
    const { youtubeUrl, material, materials, assignment, ...open } = obj;
    return { ...open, locked: true };
  });
}

import { User } from '../models/User';

// El "admin general" (admin de la web) es el usuario con `role: 'admin'` en la
// colección unificada `users`. Tiene control total sobre grupos, actividades y
// peticiones de oración, sin necesidad de ser miembro ni admin del grupo.
// El campo `role` lo gestiona la web; el modelo móvil usa strict:false, por eso
// se lee con `as any`.
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  const u = await User.findById(userId).select('role').lean();
  return (u as any)?.role === 'admin';
}

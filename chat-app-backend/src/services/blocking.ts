import { User } from '../models/User';

/**
 * Usuarios que NO deben aparecerle a `viewerId`: los que él bloqueó **y los que
 * le bloquearon a él**. El bloqueo es bidireccional en lo que se ve: si alguien
 * te bloquea, tú tampoco le ves — si no, bloquear no serviría de nada.
 *
 * Vivía dentro de `postController`, así que el feed de publicaciones lo
 * respetaba y el de reels e historias NO: bloqueabas a alguien, desaparecía de
 * tu muro y lo seguías viendo en los reels. Está aquí para que cualquier feed
 * nuevo lo tenga a mano en vez de volver a olvidarlo.
 *
 * Son DOS viajes a Mongo (~205 ms cada uno contra el Atlas de París), así que se
 * piden en paralelo y se llama UNA vez por petición, nunca por elemento.
 */
export async function getHiddenUserIds(viewerId: string): Promise<Set<string>> {
  const [me, blockedMe] = await Promise.all([
    User.findById(viewerId).select('blockedUsers').lean(),
    User.find({ blockedUsers: viewerId }).select('_id').lean(),
  ]);
  const set = new Set<string>(((me as any)?.blockedUsers ?? []).map((id: any) => id.toString()));
  blockedMe.forEach((u: any) => set.add(u._id.toString()));
  return set;
}

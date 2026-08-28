import { Types } from 'mongoose';
import { User } from '../models/User';
import { IReel } from '../models/Reel';
import { sendPushNotification } from './pushService';
import { sendWebPushToUser } from './webPushService';
import { logger } from './logger';

const log = logger('reel');

/**
 * Aviso al AUTOR de un reel/historia cuando alguien reacciona.
 *
 * Hasta que esto existió, publicar un reel no producía ninguna consecuencia:
 * nadie se enteraba de un me gusta, un comentario o un compartido, y sin esa
 * vuelta la gente publica una vez y no vuelve. Es el mismo criterio que ya se
 * aplicó a los votos de las encuestas.
 *
 * Reglas, todas deliberadas:
 * - **Nunca a uno mismo.** Darte me gusta a tu propio reel no es una novedad.
 * - **Push a los dos sitios** (Expo para la app, Web Push para el navegador):
 *   el mismo usuario puede tener solo uno de los dos.
 * - **`tag` estable por reel y tipo**: varios me gusta seguidos actualizan el
 *   mismo aviso en vez de apilar diez notificaciones.
 * - **Best-effort**: si el push falla, la acción del usuario ya se respondió. No
 *   se hace `await` desde el controlador.
 *
 * También sirve para avisar a quien escribió un comentario cuando le responden:
 * el llamador pasa el id de esa persona como `authorId`.
 */
export async function notifyReelAuthor(
  reel: Pick<IReel, '_id' | 'authorId' | 'kind' | 'caption'>,
  actorId: string,
  type: 'like' | 'comment' | 'share',
  text?: string
): Promise<void> {
  const authorId = (reel.authorId as Types.ObjectId | any)?.toString?.();
  if (!authorId || authorId === actorId) return;

  try {
    const [author, actor] = await Promise.all([
      User.findById(authorId).select('expoPushToken notificationSettings').lean(),
      User.findById(actorId).select('name').lean(),
    ]);
    if (!author) return;

    const who = (actor as any)?.name ?? 'Alguien';
    const que = reel.kind === 'story' ? 'tu historia' : 'tu reel';
    const title =
      type === 'like' ? '❤️ Nuevo me gusta'
        : type === 'share' ? '🔗 Te compartieron'
          : '💬 Nuevo comentario';
    const body =
      type === 'like' ? `A ${who} le gustó ${que}`
        : type === 'share' ? `${who} compartió ${que}`
          : `${who} comentó ${que}: ${(text ?? '').slice(0, 60)}`;

    // Una HISTORIA no vive en /reels (esa página solo lista reels): su enlace va
    // al feed, que es donde está su carrusel. Apuntarla a /reels abría el PRIMER
    // reel de la lista, porque el id no se encontraba.
    const reelId = reel._id?.toString();
    const url = reel.kind === 'story' ? `/?story=${reelId}` : `/reels?reel=${reelId}`;
    const data = { type: `reel_${type}`, reelId, kind: reel.kind };

    const expoToken = (author as any).expoPushToken;
    await Promise.allSettled([
      expoToken ? sendPushNotification(expoToken, title, body, data) : Promise.resolve(),
      sendWebPushToUser(authorId, {
        title,
        body,
        url,
        tag: `reel-${type}-${reelId}`,
        badge: 'post',
      } as any),
    ]);
  } catch (err) {
    log.warn('no se pudo avisar al autor del reel', err);
  }
}

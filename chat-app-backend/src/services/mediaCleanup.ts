import mongoose, { Types } from 'mongoose';
import { Reel } from '../models/Reel';
import { deleteCloudinaryAsset, publicIdFromUrl } from './cloudinaryService';
import { logger } from './logger';

const log = logger('media');

/**
 * Borrado de archivos de Cloudinary con RECUENTO DE REFERENCIAS.
 *
 * Desde que el editor de publicaciones permite marcar varios destinos a la vez
 * (publicación + reel + historia), **el archivo se sube UNA sola vez y varios
 * documentos apuntan al MISMO `cloudinaryPublicId`**. Borrar el asset al
 * eliminar uno de ellos dejaba a los otros con un video que ya no existe: el
 * reel se ve, la historia no, y nadie entiende por qué.
 *
 * **La clave de búsqueda es el `publicId`, NUNCA la URL entera.** Una misma
 * imagen se guarda con URLs distintas según quién la escribiera: con prefijo de
 * versión (`/v1787887778/`) o sin él, con transformaciones por delante
 * (`/f_mp4/`), y en los posts con el nombre original pegado en el fragmento
 * (`…mp4#name=video.mp4`). Comparar cadenas completas da un "no está
 * referenciado" falso — y eso es un borrado de más, que es el fallo caro. El
 * `publicId` aparece literal en TODAS esas variantes.
 *
 * Dónde puede estar referenciado el mismo archivo, con la base compartida:
 *   - `reels` (móvil + web) — un upload puede ser reel Y historia a la vez
 *   - `posts` (web)         — el mismo video publicado también en el muro
 *
 * `messages` NO se consulta a propósito: los adjuntos del chat se suben por
 * mensaje y nunca comparten archivo con un reel o un post, y un regex sobre esa
 * colección es un barrido completo contra un Atlas M0 en París (~205 ms por
 * viaje) cada vez que caduca una historia.
 *
 * Espejo de la parte web en `holy_app/backend/utils/cloudinaryDelete.js`
 * (`destroyCloudinaryUrlsIfUnused`): al tocar las reglas, editar las dos.
 */

export type AssetRef = {
  /** `cloudinaryPublicId` guardado al subir, si se tiene. */
  publicId?: string | null;
  /** URL de entrega. Sirve para deducir el publicId cuando no se guardó. */
  url?: string | null;
  /** Documento que se está borrando: no cuenta como referencia viva. */
  exceptReelId?: Types.ObjectId | string | null;
};

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtros de búsqueda de un archivo por colección. Se exporta para poder
 * probarlos sin base de datos: es la parte que se equivoca en silencio.
 */
export function referenceFilters(publicId: string): { reels: Record<string, unknown>; posts: Record<string, unknown> } {
  const inUrl = { $regex: escapeRegex(publicId) };
  return {
    reels: { $or: [{ cloudinaryPublicId: publicId }, { videoUrl: inUrl }] },
    posts: { image: inUrl },
  };
}

/** ¿Queda algún documento (aparte del excluido) usando este archivo? */
async function stillReferenced(publicId: string, exceptReelId?: Types.ObjectId | string | null): Promise<boolean> {
  const { reels, posts } = referenceFilters(publicId);

  const reelFilter: Record<string, unknown> = { ...reels };
  if (exceptReelId) reelFilter._id = { $ne: new Types.ObjectId(String(exceptReelId)) };
  if (await Reel.exists(reelFilter as any)) return true;

  // `posts` es del dominio web (misma base). No hay modelo aquí, se consulta en
  // crudo — mismo patrón que `userCascade.cleanWebDomainReferences`.
  const db = mongoose.connection.db;
  if (db) {
    const post = await db.collection('posts').findOne(posts, { projection: { _id: 1 } });
    if (post) return true;
  }

  return false;
}

/**
 * Borra el archivo de Cloudinary SOLO si ya no lo usa nadie más.
 *
 * Best-effort: nunca lanza, y ante cualquier duda NO borra. Un archivo que
 * sobra cuesta céntimos; uno borrado de más rompe un reel que sí existe.
 */
export async function deleteAssetIfUnused(ref: AssetRef): Promise<void> {
  const fromUrl = publicIdFromUrl(ref.url ?? null);
  const publicId = ref.publicId || fromUrl?.publicId;
  if (!publicId) return;

  try {
    if (await stillReferenced(publicId, ref.exceptReelId)) {
      log.debug(`asset ${publicId} sigue en uso por otro documento: no se borra`);
      return;
    }
    // Los videos y los audios comparten `resource_type: 'video'` en Cloudinary.
    const kind = fromUrl?.resourceType === 'image' ? 'image' : fromUrl?.resourceType === 'raw' ? 'document' : 'video';
    await deleteCloudinaryAsset(publicId, kind);
    log.info(`asset borrado de Cloudinary: ${publicId}`);
  } catch (err) {
    log.warn(`no se pudo comprobar/borrar el asset ${publicId}; se deja como está`, err);
  }
}

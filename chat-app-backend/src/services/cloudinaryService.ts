import cloudinary from '../config/cloudinary';

type MsgType = 'text' | 'image' | 'audio' | 'video' | 'document';

function toResourceType(msgType: MsgType): 'image' | 'video' | 'raw' {
  if (msgType === 'image') return 'image';
  // En Cloudinary el audio vive bajo el resource_type "video".
  if (msgType === 'audio' || msgType === 'video') return 'video';
  return 'raw';
}

/** Delete a single Cloudinary asset. Silently ignores errors so callers never break. */
export async function deleteCloudinaryAsset(publicId: string, msgType: MsgType): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: toResourceType(msgType) });
  } catch {
    // CDN cleanup is best-effort — never block the main operation
  }
}

/** Delete multiple Cloudinary assets in parallel. All failures are swallowed. */
export async function deleteCloudinaryAssets(
  assets: { publicId: string; type: MsgType }[]
): Promise<void> {
  await Promise.allSettled(assets.map((a) => deleteCloudinaryAsset(a.publicId, a.type)));
}

type ResourceType = 'image' | 'video' | 'raw';

/**
 * Deriva el public_id (y resource_type) a partir de una URL de Cloudinary.
 * Necesario para limpiar assets que solo guardan la URL y no el publicId
 * (p.ej. `Conversation.groupAvatar`). Devuelve null si la URL no es de Cloudinary.
 */
export function publicIdFromUrl(
  url?: string | null
): { publicId: string; resourceType: ResourceType } | null {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  // Fuera el fragmento y la query ANTES de nada: el adjunto de una publicación
  // guarda el nombre original ahí (`…mp4#name=video.mp4`) y sin quitarlo el
  // public_id sale con basura pegada y no coincide con el de Cloudinary.
  const clean = url.split('#')[0].split('?')[0];
  // .../<resource_type>/upload/(<transformaciones>/)?v<version>/<public_id>.<ext>
  const m = clean.match(/\/(image|video|raw)\/upload\/(?:.*?\/)?v\d+\/(.+)$/);
  if (!m) return null;
  const resourceType = m[1] as ResourceType;
  let publicId = m[2];
  // Para image/video la extensión es el "format" y NO forma parte del public_id.
  if (resourceType !== 'raw') publicId = publicId.replace(/\.[^/.]+$/, '');
  return { publicId, resourceType };
}

/**
 * Borra de Cloudinary una lista de URLs (best-effort). Las URLs que no sean de
 * Cloudinary se ignoran. Usa el resource_type derivado de la propia URL.
 */
export async function deleteCloudinaryUrls(urls: (string | null | undefined)[]): Promise<void> {
  const targets = urls
    .map(publicIdFromUrl)
    .filter((x): x is { publicId: string; resourceType: ResourceType } => x !== null);
  await Promise.allSettled(
    targets.map((t) =>
      cloudinary.uploader.destroy(t.publicId, { resource_type: t.resourceType }).catch(() => {})
    )
  );
}

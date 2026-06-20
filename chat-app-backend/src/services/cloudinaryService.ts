import cloudinary from '../config/cloudinary';

type MsgType = 'text' | 'image' | 'audio' | 'document';

function toResourceType(msgType: MsgType): 'image' | 'video' | 'raw' {
  if (msgType === 'image') return 'image';
  if (msgType === 'audio') return 'video';
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
  // .../<resource_type>/upload/(<transformaciones>/)?v<version>/<public_id>.<ext>
  const m = url.match(/\/(image|video|raw)\/upload\/(?:.*?\/)?v\d+\/(.+)$/);
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

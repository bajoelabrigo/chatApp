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

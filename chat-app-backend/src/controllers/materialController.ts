import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Material } from '../models/Material';
import { MaterialView } from '../models/MaterialView';

// Lista efectiva de archivos: `files[]` o el legacy fileUrl.
function effectiveFiles(m: any): { url: string; fileName?: string; fileType?: string }[] {
  if (Array.isArray(m.files) && m.files.length) {
    return m.files.filter((f: any) => f && f.url);
  }
  if (m.fileUrl) return [{ url: m.fileUrl, fileName: m.fileName, fileType: m.fileType }];
  return [];
}

// Campos públicos para la app (NO incluye urls: se entregan al "descargar").
function publicFields(m: any, flags: { owned?: boolean; viewed?: boolean } = {}) {
  const files = effectiveFiles(m);
  return {
    _id: m._id,
    title: m.title,
    slug: m.slug,
    description: m.description,
    features: m.features,
    coverImage: m.coverImage,
    thumbnail: m.thumbnail,
    price: m.price,
    payWhatYouWant: m.payWhatYouWant,
    salesCount: m.salesCount,
    files: files.map((f) => ({ fileName: f.fileName, fileType: f.fileType })),
    fileCount: files.length,
    fileName: m.fileName,
    fileType: m.fileType,
    createdAt: m.createdAt,
    owned: !!flags.owned,
    viewed: !!flags.viewed,
  };
}

// GET /materials — lista de materiales publicados con flags del usuario.
export async function listMaterials(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const materials = await Material.find({ published: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    const views = await MaterialView.find({ userId }).lean();
    const viewMap = new Map(views.map((v) => [v.materialId.toString(), v]));

    res.json(
      materials.map((m) => {
        const v = viewMap.get(m._id.toString());
        return publicFields(m, { owned: !!v?.downloaded, viewed: !!v });
      })
    );
  } catch (err) {
    console.error('listMaterials:', err);
    res.status(500).json({ error: 'Error obteniendo materiales' });
  }
}

// GET /materials/feed — último material publicado que el usuario NO ha visto/descargado.
export async function getMaterialFeed(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const seen = await MaterialView.find({ userId }).select('materialId').lean();
    const seenIds = seen.map((s) => s.materialId);

    const material = await Material.findOne({
      published: true,
      _id: { $nin: seenIds },
    })
      .sort({ notifiedAt: -1, createdAt: -1 })
      .lean();

    res.json(material ? publicFields(material) : null);
  } catch (err) {
    console.error('getMaterialFeed:', err);
    res.status(500).json({ error: 'Error obteniendo feed' });
  }
}

// POST /materials/:id/viewed — marca que el usuario abrió el material.
export async function markViewed(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    await MaterialView.findOneAndUpdate(
      { userId, materialId: req.params.id },
      { $set: { viewedAt: new Date() }, $setOnInsert: { downloaded: false } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('markViewed:', err);
    res.status(500).json({ error: 'Error registrando vista' });
  }
}

// POST /materials/:id/download — solo materiales GRATIS: registra descarga y
// devuelve el enlace del archivo. Los de pago se compran en la web (navegador).
export async function downloadMaterial(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const material = await Material.findOne({ _id: req.params.id, published: true });
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });

    if ((material.price || 0) > 0) {
      return res.status(402).json({ error: 'Este material es de pago; cómpralo en la web' });
    }

    await MaterialView.findOneAndUpdate(
      { userId, materialId: material._id },
      { $set: { downloaded: true, viewedAt: new Date() } },
      { upsert: true }
    );
    material.salesCount = (material.salesCount || 0) + 1;
    await material.save();

    const files = effectiveFiles(material);
    res.json({
      files: files.map((f) => ({ url: f.url, fileName: f.fileName, fileType: f.fileType })),
      fileUrl: files[0]?.url || material.fileUrl,
      fileName: files[0]?.fileName || material.fileName,
    });
  } catch (err) {
    console.error('downloadMaterial:', err);
    res.status(500).json({ error: 'Error descargando material' });
  }
}

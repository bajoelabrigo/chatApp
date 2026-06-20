import api from './authService';

export interface Material {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  features?: string[];
  coverImage?: string;
  thumbnail?: string;
  price: number;
  payWhatYouWant: boolean;
  salesCount?: number;
  files?: { fileName?: string; fileType?: string }[];
  fileCount?: number;
  fileName?: string;
  fileType?: string;
  owned?: boolean;
  viewed?: boolean;
}

export interface MaterialFile {
  url: string;
  fileName?: string;
  fileType?: string;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getMaterials(token: string): Promise<Material[]> {
  const { data } = await api.get<Material[]>('/materials', h(token));
  return data;
}

export async function getMaterialFeed(token: string): Promise<Material | null> {
  const { data } = await api.get<Material | null>('/materials/feed', h(token));
  return data;
}

export async function markMaterialViewed(token: string, id: string): Promise<void> {
  await api.post(`/materials/${id}/viewed`, {}, h(token));
}

// Solo materiales gratis: registra la descarga y devuelve el enlace del archivo.
export async function downloadMaterial(
  token: string,
  id: string
): Promise<{ fileUrl: string; fileName: string; files?: MaterialFile[] }> {
  const { data } = await api.post<{ fileUrl: string; fileName: string; files?: MaterialFile[] }>(
    `/materials/${id}/download`,
    {},
    h(token)
  );
  return data;
}

// Etiqueta de precio: "Gratis" / "$4.99" / "$4.99+".
export function priceLabel(m: Material): string {
  if (!m.price || m.price <= 0) return 'Gratis';
  return m.payWhatYouWant ? `$${m.price.toFixed(2)}+` : `$${m.price.toFixed(2)}`;
}

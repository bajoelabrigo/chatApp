import api from './authService';

export interface UploadResult {
  url: string;
  publicId: string;
  messageType: 'image' | 'audio' | 'video' | 'document';
  originalName: string;
  size: number;
  mimeType: string;
}

/**
 * @param onProgress % REAL de bytes enviados (0-100). Un video tarda, y sin esa
 *                   señal la subida es indistinguible de "se coló": la gente
 *                   vuelve a pulsar publicar. Al llegar a 100 el archivo ya
 *                   viajó pero el servidor sigue trabajando (recomprime con
 *                   ffmpeg antes de mandarlo a Cloudinary).
 */
export async function uploadFile(
  token: string,
  fileUri: string,
  mimeType: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as any);

  const { data } = await api.post<UploadResult>('/upload', formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (e) => {
      if (!onProgress || !e.total) return;
      onProgress(Math.min(100, Math.round((e.loaded * 100) / e.total)));
    },
  });
  return data;
}

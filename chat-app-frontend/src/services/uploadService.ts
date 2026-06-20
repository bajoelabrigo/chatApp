import api from './authService';

export interface UploadResult {
  url: string;
  publicId: string;
  messageType: 'image' | 'audio' | 'document';
  originalName: string;
  size: number;
  mimeType: string;
}

export async function uploadFile(
  token: string,
  fileUri: string,
  mimeType: string,
  fileName: string
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
  });
  return data;
}

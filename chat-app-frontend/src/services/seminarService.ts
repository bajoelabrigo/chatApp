import api from './authService';

export interface SeminarFile {
  url?: string;
  name?: string;
  format?: string;
  size?: string;
  materialId?: string;
  uploadedAt?: string;
}

export interface SeminarClass {
  _id: string;
  title: string;
  youtubeUrl?: string;
  order: number;
  duration?: string;
  image?: string;
  materials?: SeminarFile[];
  material?: SeminarFile;
  assignment?: SeminarFile;
  locked: boolean;
}

export interface SeminarTask {
  _id?: string;
  classId: string;
  fileUrl?: string;
  fileName?: string;
  fileFormat?: string;
  fileSize?: string;
  message?: string;
  studentComment?: string;
  feedback?: string;
  status: 'pendiente' | 'completo' | 'incompleto' | 'enviado';
  submittedAt?: string;
}

export interface SeminarProgress {
  completedClasses: string[];
  certificate?: { code?: string; issuedAt?: string };
  tasks: SeminarTask[];
}

export interface SeminarSummary {
  _id: string;
  title: string;
  description?: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
  participantsCount?: number;
  classCount?: number;
}

export interface MySeminarSummary {
  _id: string;
  title: string;
  description?: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
  totalClasses: number;
  completedClasses: number;
  hasCertificate: boolean;
}

export interface SeminarDetail {
  _id: string;
  title: string;
  description?: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
  createdBy?: { _id: string; name: string; avatar?: string };
  participants: { user: string }[];
  seminar: { enabled: boolean; classes: SeminarClass[] };
  isEnrolled: boolean;
  participantsCount: number;
}

export interface CertificateData {
  code: string;
  issuedAt: string;
  studentName?: string;
  seminarTitle?: string;
  totalClasses: number;
}

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getSeminars(token: string): Promise<SeminarSummary[]> {
  const { data } = await api.get<SeminarSummary[]>('/seminars', h(token));
  return data;
}

export async function getMySeminars(token: string): Promise<MySeminarSummary[]> {
  const { data } = await api.get<MySeminarSummary[]>('/seminars/mine', h(token));
  return data;
}

export async function getSeminarDetail(token: string, id: string): Promise<SeminarDetail> {
  const { data } = await api.get<SeminarDetail>(`/seminars/${id}`, h(token));
  return data;
}

export async function getSeminarClasses(token: string, id: string): Promise<SeminarClass[]> {
  const { data } = await api.get<SeminarClass[]>(`/seminars/${id}/classes`, h(token));
  return data;
}

export async function joinSeminar(token: string, id: string): Promise<{ message: string }> {
  const { data } = await api.post(`/seminars/${id}/join`, {}, h(token));
  return data;
}

export async function leaveSeminar(token: string, id: string): Promise<{ message: string }> {
  const { data } = await api.patch(`/seminars/${id}/leave`, {}, h(token));
  return data;
}

export async function markClassCompleted(token: string, id: string, classId: string): Promise<{ message: string }> {
  const { data } = await api.patch(`/seminars/${id}/classes/${classId}/mark-completed`, {}, h(token));
  return data;
}

export async function getMyProgress(token: string, id: string): Promise<SeminarProgress> {
  const { data } = await api.get<SeminarProgress>(`/seminars/${id}/progress`, h(token));
  return data;
}

// Lanza el error de axios si aún faltan clases (403, con {completed,total} en el body) — el caller lo captura.
export async function getMyCertificate(token: string, id: string): Promise<CertificateData> {
  const { data } = await api.get<CertificateData>(`/seminars/${id}/certificate`, h(token));
  return data;
}

export async function uploadTask(
  token: string,
  id: string,
  classId: string,
  body: { fileUrl?: string; fileName?: string; fileFormat?: string; fileSizeBytes?: number; message?: string }
): Promise<{ message: string }> {
  const { data } = await api.post(`/seminars/${id}/classes/${classId}/task`, body, h(token));
  return data;
}

export async function deleteMyTask(token: string, id: string, classId: string): Promise<{ message: string }> {
  const { data } = await api.delete(`/seminars/${id}/classes/${classId}/task`, h(token));
  return data;
}

export async function updateStudentComment(
  token: string,
  id: string,
  classId: string,
  studentComment: string
): Promise<{ message: string }> {
  const { data } = await api.patch(`/seminars/${id}/classes/${classId}/student-comment`, { studentComment }, h(token));
  return data;
}

export async function getMyTaskForClass(token: string, id: string, classId: string): Promise<SeminarTask | null> {
  const { data } = await api.get<SeminarTask | null>(`/seminars/${id}/classes/${classId}/my-task`, h(token));
  return data;
}

import api from './authService';

export async function fetchGroupCallToken(
  authToken: string,
  conversationId: string
): Promise<{ token: string; roomName: string; livekitUrl: string }> {
  const { data } = await api.post(
    '/calls/group-token',
    { conversationId },
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  return data;
}

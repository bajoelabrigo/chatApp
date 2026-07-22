import api from './authService';

// Estado del modal de bienvenida socio. El móvil restaura el usuario de
// SecureStore sin refrescar, así que consulta esto al arrancar.
export interface SocioWelcome {
  pending: boolean;
  name: string;
  // >= $20/mes desbloquea materiales; el modal muestra un texto u otro.
  fullAccess?: boolean;
}

export async function getSocioWelcome(token: string): Promise<SocioWelcome> {
  const { data } = await api.get<SocioWelcome>('/users/me/socio-welcome', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function markSocioWelcomeSeen(token: string): Promise<void> {
  await api.post('/users/me/socio-welcome/seen', {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

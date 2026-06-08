import jwt from 'jsonwebtoken';

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET as string, { expiresIn: '24h' });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): { userId: string; email: string } {
  return jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string; email: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
}

export function verifyToken(token: string): { userId: string; email?: string } {
  return jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string; email?: string };
}

/**
 * Verifica un token aceptando el secreto del móvil y, como respaldo, el de la web
 * (WEB_JWT_SECRET). Normaliza el id: la web firma `{ id }`, el móvil `{ userId }`.
 * Permite que el frontend web use el chat-backend móvil sin re-loguear a nadie.
 */
export function verifyAnyToken(token: string): { userId: string; email?: string } {
  const secrets = [process.env.JWT_SECRET, process.env.WEB_JWT_SECRET].filter(Boolean) as string[];
  let lastErr: unknown;
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret) as { userId?: string; id?: string; email?: string };
      const userId = decoded.userId || decoded.id;
      if (!userId) throw new Error('Token sin userId/id');
      return { userId, email: decoded.email };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Token inválido');
}

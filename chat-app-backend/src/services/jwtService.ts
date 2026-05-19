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

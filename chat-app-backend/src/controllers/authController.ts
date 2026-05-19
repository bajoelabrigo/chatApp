import { Request, Response } from 'express';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/jwtService';
import { User } from '../models/User';

export async function googleSignIn(req: Request, res: Response): Promise<void> {
  const { idToken } = req.body;
  if (!idToken) {
    res.status(400).json({ error: 'idToken requerido' });
    return;
  }

  try {
    const googlePayload = await verifyGoogleToken(idToken);

    const user = await User.findOneAndUpdate(
      { googleId: googlePayload.googleId },
      {
        $set: {
          email: googlePayload.email,
          name: googlePayload.name,
          avatar: googlePayload.avatar,
          lastLogin: new Date(),
        },
        $setOnInsert: { googleId: googlePayload.googleId },
      },
      { upsert: true, new: true }
    );

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Error en googleSignIn:', error);
    res.status(401).json({ error: 'No se pudo autenticar con Google' });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;
  if (!token) {
    res.status(400).json({ error: 'refreshToken requerido' });
    return;
  }

  try {
    const { userId } = verifyRefreshToken(token);
    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado' });
      return;
    }

    const newToken = generateAccessToken(user.id, user.email);
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'refreshToken inválido o expirado' });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  try {
    const user = await User.findById(userId).select('-googleId');
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
}

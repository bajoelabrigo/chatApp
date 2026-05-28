import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/jwtService';
import { sendVerificationCode, sendPasswordResetCode } from '../services/emailService';
import { User } from '../models/User';

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function codeExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000);
}

// ── Google Sign-In ───────────────────────────────────────────
export async function googleSignIn(req: Request, res: Response): Promise<void> {
  const { idToken } = req.body;
  if (!idToken) { res.status(400).json({ error: 'idToken requerido' }); return; }

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
          emailVerified: true,
          authProvider: 'google',
        },
        $setOnInsert: { googleId: googlePayload.googleId },
      },
      { upsert: true, new: true }
    );

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider } });
  } catch {
    res.status(401).json({ error: 'No se pudo autenticar con Google' });
  }
}

// ── Register ─────────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: 'Nombre, correo y contraseña son requeridos' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    return;
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      if (!existing.emailVerified && existing.authProvider === 'email') {
        const code = randomCode();
        existing.verificationCode = code;
        existing.verificationCodeExpiry = codeExpiry();
        await existing.save();
        await sendVerificationCode(existing.email, existing.name, code);
        res.status(409).json({ error: 'Ya existe una cuenta pendiente de verificación. Reenvíamos el código.', resent: true, email: existing.email });
        return;
      }
      res.status(409).json({ error: 'Ya existe una cuenta con este correo' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const code = randomCode();

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      authProvider: 'email',
      emailVerified: false,
      verificationCode: code,
      verificationCodeExpiry: codeExpiry(),
    });

    await sendVerificationCode(user.email, user.name, code);
    res.status(201).json({ message: 'Revisa tu correo para verificar tu cuenta.', email: user.email });
  } catch {
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
}

// ── Verify Email ─────────────────────────────────────────────
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { email, code } = req.body;
  if (!email || !code) { res.status(400).json({ error: 'Correo y código requeridos' }); return; }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    if (user.emailVerified) { res.status(400).json({ error: 'El correo ya está verificado' }); return; }

    if (user.verificationCode !== code || !user.verificationCodeExpiry || user.verificationCodeExpiry < new Date()) {
      res.status(400).json({ error: 'Código incorrecto o expirado' });
      return;
    }

    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    user.lastLogin = new Date();
    await user.save();

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider } });
  } catch {
    res.status(500).json({ error: 'Error verificando el código' });
  }
}

// ── Resend Code ───────────────────────────────────────────────
export async function resendCode(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Correo requerido' }); return; }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.emailVerified) { res.json({ message: 'Si el correo existe, recibirás un nuevo código.' }); return; }

    const code = randomCode();
    user.verificationCode = code;
    user.verificationCodeExpiry = codeExpiry();
    await user.save();
    await sendVerificationCode(user.email, user.name, code);
    res.json({ message: 'Código reenviado' });
  } catch {
    res.status(500).json({ error: 'Error reenviando código' });
  }
}

// ── Login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'Correo y contraseña requeridos' }); return; }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password) {
      res.status(401).json({ error: 'Correo o contraseña incorrectos' });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) { res.status(401).json({ error: 'Correo o contraseña incorrectos' }); return; }

    if (!user.emailVerified) {
      const code = randomCode();
      user.verificationCode = code;
      user.verificationCodeExpiry = codeExpiry();
      await user.save();
      await sendVerificationCode(user.email, user.name, code);
      res.status(403).json({ error: 'Cuenta no verificada. Te enviamos un nuevo código.', needsVerification: true, email: user.email });
      return;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider } });
  } catch {
    res.status(500).json({ error: 'Error iniciando sesión' });
  }
}

// ── Forgot Password ───────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Correo requerido' }); return; }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim(), authProvider: 'email' });
    if (!user) { res.json({ message: 'Si el correo existe, recibirás un código.', sent: false }); return; }

    const code = randomCode();
    user.resetCode = code;
    user.resetCodeExpiry = codeExpiry();
    await user.save();
    await sendPasswordResetCode(user.email, user.name, code);
    res.json({ message: 'Código enviado', email: user.email, sent: true });
  } catch {
    res.status(500).json({ error: 'Error procesando solicitud' });
  }
}

// ── Reset Password ────────────────────────────────────────────
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { email, code, password } = req.body;
  if (!email || !code || !password) { res.status(400).json({ error: 'Todos los campos son requeridos' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' }); return; }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    if (user.resetCode !== code || !user.resetCodeExpiry || user.resetCodeExpiry < new Date()) {
      res.status(400).json({ error: 'Código incorrecto o expirado' });
      return;
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    user.emailVerified = true;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch {
    res.status(500).json({ error: 'Error actualizando contraseña' });
  }
}

// ── Refresh Token ─────────────────────────────────────────────
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;
  if (!token) { res.status(400).json({ error: 'refreshToken requerido' }); return; }

  try {
    const { userId } = verifyRefreshToken(token);
    const user = await User.findById(userId);
    if (!user) { res.status(401).json({ error: 'Usuario no encontrado' }); return; }
    res.json({ token: generateAccessToken(user.id, user.email) });
  } catch {
    res.status(401).json({ error: 'refreshToken inválido o expirado' });
  }
}

// ── Get Me ────────────────────────────────────────────────────
export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  try {
    const user = await User.findById(userId).select('-password -verificationCode -resetCode');
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
}

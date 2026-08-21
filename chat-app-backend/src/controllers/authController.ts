import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/jwtService';
import { sendVerificationCode, sendPasswordResetCode } from '../services/emailService';
import { User } from '../models/User';
import {
  randomCode, hashCode, codeExpiry, verifyCode, codeErrorMessage, codeErrorStatus,
  MAX_CODE_ATTEMPTS,
} from '../services/authCodes';

// ── Google Sign-In ───────────────────────────────────────────
export async function googleSignIn(req: Request, res: Response): Promise<void> {
  const { idToken } = req.body;
  if (!idToken) { res.status(400).json({ error: 'idToken requerido' }); return; }

  try {
    const googlePayload = await verifyGoogleToken(idToken);
    const email = googlePayload.email.toLowerCase().trim();

    // 1) Coincidencia directa por googleId
    let user = await User.findOne({ googleId: googlePayload.googleId });

    // 2) Fallback: cuenta existente con el mismo email pero sin googleId
    //    (p. ej. usuarios migrados desde la web, que nunca guardaron googleId).
    //    Se le adjunta el googleId la primera vez que entra con Google.
    if (!user) {
      const byEmail = await User.findOne({ email });
      if (byEmail) {
        user = byEmail;
        if (!user.googleId) user.googleId = googlePayload.googleId;
      }
    }

    if (user) {
      // Preservar el nombre/foto que el usuario ya tenga (incluida la foto migrada);
      // solo rellenar si faltan.
      if (!user.name) user.name = googlePayload.name;
      if (!user.avatar && googlePayload.avatar) user.avatar = googlePayload.avatar;
      user.email = email;
      user.lastLogin = new Date();
      user.emailVerified = true;
      user.authProvider = 'google';
      await user.save();
    } else {
      // Usuario nuevo de Google
      user = await User.create({
        googleId: googlePayload.googleId,
        email,
        name: googlePayload.name,
        avatar: googlePayload.avatar,
        emailVerified: true,
        authProvider: 'google',
        lastLogin: new Date(),
      });
    }

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider, emailVerified: user.emailVerified } });
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
        existing.verificationCode = await hashCode(code);
        existing.verificationCodeExpiry = codeExpiry();
        existing.verificationAttempts = 0;
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
      verificationCode: await hashCode(code),
      verificationCodeExpiry: codeExpiry(),
      verificationAttempts: 0,
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

    const verdict = await verifyCode(
      { stored: user.verificationCode, expiry: user.verificationCodeExpiry, attempts: user.verificationAttempts },
      String(code),
    );
    if (verdict !== 'ok') {
      // Un fallo gasta intento. Si ese fallo agota el cupo se responde ya como
      // bloqueado, en vez de decir "incorrecto" y bloquear calladamente.
      let shown = verdict;
      if (verdict === 'mismatch') {
        user.verificationAttempts = (user.verificationAttempts ?? 0) + 1;
        await user.save();
        if (user.verificationAttempts >= MAX_CODE_ATTEMPTS) shown = 'locked';
      }
      res.status(codeErrorStatus(shown)).json({ error: codeErrorMessage(shown) });
      return;
    }

    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    user.verificationAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider, emailVerified: user.emailVerified } });
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
    user.verificationCode = await hashCode(code);
    user.verificationCodeExpiry = codeExpiry();
    user.verificationAttempts = 0;
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

    // Sin verificar YA NO bloquea el acceso. Antes esto respondía 403 y la app
    // no dejaba pasar, mientras que en la web el mismo usuario entraba sin
    // problema: quien se registraba por la web e ignoraba el correo se quedaba
    // fuera de la app para siempre sin saber por qué. Ahora entra y la app le
    // muestra un aviso con un botón para reenviar el código.
    //
    // Tampoco se reenvía el código aquí: se hacía en CADA intento de login, o
    // sea un correo por intento. Lo pide el usuario desde el aviso.
    user.lastLogin = new Date();
    await user.save();

    const token = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    res.json({ token, refreshToken, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, authProvider: user.authProvider, emailVerified: user.emailVerified } });
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
    user.resetCode = await hashCode(code);
    user.resetCodeExpiry = codeExpiry();
    user.resetAttempts = 0;
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

    const verdict = await verifyCode(
      { stored: user.resetCode, expiry: user.resetCodeExpiry, attempts: user.resetAttempts },
      String(code),
    );
    if (verdict !== 'ok') {
      let shown = verdict;
      if (verdict === 'mismatch') {
        user.resetAttempts = (user.resetAttempts ?? 0) + 1;
        await user.save();
        if (user.resetAttempts >= MAX_CODE_ATTEMPTS) shown = 'locked';
      }
      res.status(codeErrorStatus(shown)).json({ error: codeErrorMessage(shown) });
      return;
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    user.resetAttempts = 0;
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

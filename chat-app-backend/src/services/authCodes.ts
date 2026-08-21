/**
 * Códigos de un solo uso: verificar correo y restablecer contraseña.
 *
 * El agujero que cierra este módulo: un código de 6 dígitos son 1.000.000 de
 * combinaciones y NO había ningún límite de intentos, así que dentro de la
 * ventana de 10 minutos se podían probar todas y quedarse con la cuenta. Un
 * rate limit por IP no basta por sí solo: el recurso a proteger es la CUENTA y
 * el atacante puede rotar de IP. El contador vive en el usuario, no en memoria.
 */
import { randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';

/** Fallos consecutivos antes de invalidar el código y obligar a pedir otro. */
export const MAX_CODE_ATTEMPTS = 5;

const CODE_TTL_MS = 10 * 60 * 1000;

export function codeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MS);
}

/**
 * `randomInt` y no `Math.random()`: el generador de V8 no es criptográfico y su
 * estado se puede reconstruir observando salidas suficientes. Aquí ya se usaba
 * el criptográfico en `models/Meeting.ts`; esto solo alinea el resto.
 */
export function randomCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Coste 10, no el 12 de las contraseñas: el código vive 10 minutos y solo admite
 * MAX_CODE_ATTEMPTS pruebas, así que 12 solo añadiría latencia en cada intento.
 * Aun así frena en seco el ataque offline si alguna vez se filtra la base: con
 * el texto plano de antes, un volcado regalaba todos los códigos vivos.
 */
const CODE_ROUNDS = 10;

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, CODE_ROUNDS);
}

/** Los códigos emitidos antes de hashear siguen en claro; se aceptan hasta que caduquen. */
export function isHashed(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

/**
 * Comparación en tiempo constante. Longitudes distintas se descartan antes:
 * `timingSafeEqual` lanza si difieren, y la longitud no es secreta.
 */
export async function codeMatches(stored: string | undefined | null, candidate: string): Promise<boolean> {
  if (!stored || !candidate) return false;
  if (isHashed(stored)) {
    try { return await bcrypt.compare(candidate, stored); } catch { return false; }
  }
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type CodeVerdict = 'ok' | 'missing' | 'locked' | 'expired' | 'mismatch';

export interface CodeState {
  stored?: string | null;
  expiry?: Date | null;
  attempts?: number | null;
}

/**
 * `locked` se comprueba ANTES que `expired`: si el usuario agotó los intentos
 * hay que decírselo aunque el código ya hubiera caducado, o el mensaje de error
 * cambiaría solo por el paso del tiempo y sería imposible de entender.
 */
export async function verifyCode(
  state: CodeState,
  candidate: string,
  now: Date = new Date(),
): Promise<CodeVerdict> {
  if (!state.stored || !state.expiry) return 'missing';
  if ((state.attempts ?? 0) >= MAX_CODE_ATTEMPTS) return 'locked';
  if (state.expiry.getTime() < now.getTime()) return 'expired';
  return (await codeMatches(state.stored, candidate)) ? 'ok' : 'mismatch';
}

/** Mensaje para el usuario. El frontend solo pinta `data.error`, no lo compara. */
export function codeErrorMessage(verdict: CodeVerdict): string {
  switch (verdict) {
    case 'locked':   return 'Demasiados intentos fallidos. Solicita un código nuevo.';
    case 'expired':  return 'El código expiró. Solicita uno nuevo.';
    case 'missing':  return 'No hay ningún código pendiente. Solicita uno nuevo.';
    default:         return 'Código incorrecto';
  }
}

/** 429 al quedar bloqueado; el resto son errores de la petición. */
export function codeErrorStatus(verdict: CodeVerdict): number {
  return verdict === 'locked' ? 429 : 400;
}

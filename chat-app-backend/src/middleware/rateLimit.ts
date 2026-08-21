/**
 * Límites de intentos en las rutas de autenticación.
 *
 * Van por IP a propósito, NO por correo: si la clave fuera el correo, cualquiera
 * podría dejar fuera a un usuario concreto pidiendo su cuenta en bucle. La
 * protección POR CUENTA es el contador de intentos del código (`authCodes.ts`);
 * esto de aquí es la capa de volumen.
 *
 * ⚠️ Depende de `app.set('trust proxy', …)`. Detrás de nginx, sin eso, `req.ip`
 * es siempre la IP del proxy: el límite se aplicaría a TODOS los usuarios juntos
 * y el primer atacante dejaría la app inservible para la comunidad entera.
 */
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { logger } from '../services/logger';

const MINUTE = 60 * 1000;

const log = logger('ratelimit');
let avisado = false;

/**
 * Red de seguridad: si nginx no manda `X-Forwarded-For`, TODAS las peticiones
 * llegan con la IP del proxy y el límite se convertiría en un cubo único para
 * toda la comunidad — el primer usuario que agote el cupo deja fuera al resto.
 *
 * Ante esa situación se prefiere NO limitar (y gritarlo en el log) antes que
 * bloquear a todos: la protección del ataque real —probar códigos de 6 dígitos
 * a lo bruto— es el contador por cuenta de `authCodes.ts`, que no depende de la
 * IP. Esto solo renuncia a la capa de volumen mientras la config esté mal.
 */
function sinIpReal(req: Request): boolean {
  if (req.headers['x-forwarded-for']) return false;
  if (!avisado) {
    avisado = true;
    log.error(
      'Las peticiones llegan SIN X-Forwarded-For: el límite por IP queda DESACTIVADO ' +
      'para no bloquear a todos los usuarios a la vez. Añade en nginx: ' +
      'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    );
  }
  return true;
}

function limiter(opts: { windowMs: number; max: number; message: string }): ReturnType<typeof rateLimit> {
  const config: Partial<Options> = {
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // El cliente solo pinta `data.error`; se mantiene esa forma.
    message: { error: opts.message },
    skip: sinIpReal,
    // Sin esto express-rate-limit avisa de que trust proxy está activo pero la
    // cabecera no llega; ya lo cubre `sinIpReal` con un mensaje accionable.
    validate: { xForwardedForHeader: false },
  };
  return rateLimit(config);
}

/** Solo para los tests: reinicia el aviso de una vez. */
export function _resetAviso(): void { avisado = false; }

/** Contraseñas: bcrypt ya las protege, esto corta el volumen. */
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  max: 20,
  message: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
});

/** Comprobación de códigos de 6 dígitos: el vector de toma de cuenta. */
export const codeCheckLimiter = limiter({
  windowMs: 15 * MINUTE,
  max: 15,
  message: 'Demasiados intentos con el código. Espera unos minutos.',
});

/**
 * Rutas que MANDAN UN CORREO (registro, olvidé mi contraseña, reenviar código).
 * Más estricto por dos motivos: no acribillar el buzón de un tercero, y porque
 * el proveedor SMTP corta la IP del VPS entera si se dispara el volumen —ya pasó
 * con `450 4.7.1 too many AUTH commands`, ver el apartado de correos en CLAUDE.md.
 */
export const emailSendLimiter = limiter({
  windowMs: 60 * MINUTE,
  max: 8,
  message: 'Has pedido demasiados correos. Inténtalo dentro de un rato.',
});

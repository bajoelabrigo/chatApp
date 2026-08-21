/**
 * Registro con marca de tiempo y captura de fallos no manejados.
 *
 * PM2 ya guarda stdout/stderr en ~/.pm2/logs, pero un `console.log` suelto no
 * dice CUÁNDO pasó ni de qué nivel es, así que un log de días es inútil para
 * reconstruir un incidente (un webhook de PayPal perdido, el cron de avisos).
 * Esto no manda nada fuera ni añade servicio externo: solo da forma a lo que ya
 * se escribe.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** `2026-08-21T00:31:04.512Z WARN  [paypal] mensaje` */
export function formatLine(level: LogLevel, scope: string, message: string, at: Date = new Date()): string {
  return `${at.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
}

/**
 * Un Error se resume en una línea (nombre + mensaje) y su pila va aparte, para
 * que el log siga siendo legible; el resto se serializa sin reventar por
 * referencias circulares.
 */
export function describe(value: unknown): { text: string; stack?: string } {
  if (value instanceof Error) return { text: `${value.name}: ${value.message}`, stack: value.stack };
  if (typeof value === 'string') return { text: value };
  try { return { text: JSON.stringify(value) ?? String(value) }; }
  catch { return { text: String(value) }; }
}

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(formatLine(level, scope, message));
  if (extra !== undefined) {
    const { text, stack } = describe(extra);
    sink(stack ?? text);
  }
}

export function logger(scope: string) {
  return {
    info:  (message: string, extra?: unknown) => emit('info',  scope, message, extra),
    warn:  (message: string, extra?: unknown) => emit('warn',  scope, message, extra),
    error: (message: string, extra?: unknown) => emit('error', scope, message, extra),
  };
}

/**
 * `uncaughtException` SÍ tumba el proceso a propósito: tras uno, el estado del
 * proceso puede estar corrupto y PM2 lo reinicia limpio. Una promesa sin
 * `.catch` (`unhandledRejection`) suele ser una llamada de E/S a la que le
 * faltó el manejador, no estado corrupto: se registra y se sigue, porque
 * tumbar el servidor echaría de la vez a todos los conectados por socket.
 * Node 24 la trata por defecto como excepción, o sea que sin esto el chat
 * entero se cae por un `.catch` olvidado en cualquier controlador.
 */
export function installProcessHandlers(exit: (code: number) => void = process.exit): void {
  const log = logger('process');

  process.on('unhandledRejection', (reason) => {
    log.error('Promesa rechazada sin manejador (el proceso sigue vivo)', reason);
  });

  process.on('uncaughtException', (error) => {
    log.error('Excepción no capturada; cerrando para que PM2 reinicie limpio', error);
    exit(1);
  });
}

// Tiempo relativo corto ("ahora", "5m", "3h", "2d") para tarjetas de Comunidad.
// Sin dependencia nueva (date-fns no está en el frontend) — un helper chico basta.
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const d = new Date(iso);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

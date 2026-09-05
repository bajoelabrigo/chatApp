// Con qué ofrenda mensual entra gratis un material.
//
// TERCER ESPEJO de la regla: la fuente es `holy_app/backend/utils/materialAccess.js`
// (que es quien DECIDE: la compra y la descarga se hacen en la web) y su copia de
// navegador `holy_app/frontend/src/lib/materialAccess.js`. Aquí solo se necesita
// para ANUNCIARLO en la app móvil, que lee el mismo catálogo pero manda al usuario
// a la web para pagar o descargar. Al tocar los mínimos, editar los tres.
//
// Se calcula en el servidor a propósito: así cambiar un mínimo no obliga a
// publicar una versión nueva de la app.
// Estudios desde $10 (bajó de $20 el 2026-09-05), libros desde $50.
export const SOCIO_MIN_BY_KIND: Record<string, number> = { material: 10, libro: 50 };

// Ofrenda con la que este material entra gratis: la suya propia si la tiene,
// si no la de su tipo.
export function baseSocioMin(m: any): number {
  const propio = Number(m?.socioMin);
  if (m?.socioMin != null && Number.isFinite(propio) && propio >= 0) return propio;
  return SOCIO_MIN_BY_KIND[m?.kind] ?? SOCIO_MIN_BY_KIND.material;
}

// Si el material se lleva con MENOS de lo que pide su tipo, el importe; si no,
// `null`. La app pinta la insignia "o Socio $5+" solo cuando llega un número, así
// que no tiene que saberse ningún mínimo de memoria.
//
// No mira las promociones del catálogo (viven en `materialpromos`, que solo lee
// holy-backend): una promo abarata las cosas, nunca las encarece, así que lo peor
// que puede pasar es que la app anuncie un precio de socio más alto que el que la
// web acabará aplicando.
export function socioDealMin(m: any): number | null {
  const propio = baseSocioMin(m);
  const porTipo = SOCIO_MIN_BY_KIND[m?.kind] ?? SOCIO_MIN_BY_KIND.material;
  return propio < porTipo ? propio : null;
}

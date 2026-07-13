/**
 * Escapa un texto para meterlo en una expresión regular como LITERAL.
 *
 * Sin esto, lo que escribe el usuario se interpreta como un patrón. Dos problemas,
 * y el segundo es grave:
 *
 *  1. Buscar "(" o "*" produce un regex inválido → la consulta lanza y el
 *     endpoint devuelve 500 por escribir un paréntesis en un buscador.
 *  2. Un patrón como "(a+)+$" provoca backtracking catastrófico: MongoDB se queda
 *     girando sobre cada documento. Cualquier usuario con sesión puede tumbar el
 *     servidor desde un campo de búsqueda (ReDoS).
 *
 * El arreglo correcto es escapar, NO filtrar los caracteres "raros": lo que el
 * usuario escribe es texto, y como texto hay que buscarlo. Un grupo que se llame
 * "Jóvenes (Madrid)" tiene que poder encontrarse escribiendo su nombre entero.
 *
 * Se usa en toda búsqueda que construya un `$regex` con entrada del usuario.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

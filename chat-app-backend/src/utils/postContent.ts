// Espejo de `holy_app/backend/utils/postContent.js` — al tocar las reglas, editar
// los dos. Un editor Quill vacío emite `<p><br></p>`, no `""`, así que un
// `.trim()` sobre el HTML crudo nunca detecta "no se escribió nada".
export function hasVisibleText(html?: string | null): boolean {
  return (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length > 0;
}

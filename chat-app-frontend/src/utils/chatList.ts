import type { Message } from '../services/conversationService';
// `docIcon` (icono según la extensión) vive en MessageBubble, que es quien lo usa
// para pintar los adjuntos. Se importa de ahí en vez de duplicar el mapa.
import { docIcon } from '../components/chat/MessageBubble';

// Helpers puros de la lista de mensajes: agrupar por día y etiquetar las fechas.
//
// Vivían dentro de `app/chat/[id].tsx` (2.200 líneas). No dependen de React ni de
// ningún estado: son funciones de entrada → salida, así que fuera. Aquí se pueden
// leer y probar sin arrancar una pantalla entera.

/** Icono para la vista previa de un adjunto en la lista o en una cita. */
export function docIconFor(type?: string, fileName?: string): string {
  if (type === 'image') return '🖼️';
  if (type === 'audio') return '🎤';
  return docIcon(fileName);
}

/** Un elemento de la lista: o un mensaje, o el separador de día que lo precede. */
export type ListItem =
  | { kind: 'message'; data: Message }
  | { kind: 'separator'; key: string; label: string };

/** 'YYYY-MM-DD' en hora LOCAL — es la clave con la que se agrupa por día. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Hoy" / "Ayer" / "14 de julio" (el año solo si no es el actual). */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const key = toDateKey(d);
  const now = new Date();
  if (key === toDateKey(now)) return 'Hoy';

  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  if (key === toDateKey(yd)) return 'Ayer';

  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Mete un separador de día antes del primer mensaje de cada jornada. */
export function buildListData(messages: Message[]): ListItem[] {
  const items: ListItem[] = [];
  let lastKey = '';

  for (const msg of messages) {
    const key = toDateKey(new Date(msg.createdAt));
    if (key !== lastKey) {
      items.push({ kind: 'separator', key: `sep_${key}`, label: formatDateLabel(msg.createdAt) });
      lastKey = key;
    }
    items.push({ kind: 'message', data: msg });
  }

  return items;
}

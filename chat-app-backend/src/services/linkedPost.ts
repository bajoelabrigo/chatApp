import { Post } from '../models/Post';

// Crea un post AUTOMÁTICO en la colección compartida `posts` (dominio de la web
// `holy_app`, misma base de datos) que enlaza algo ocurrido en un grupo: una
// actividad, un plan de lectura, una petición o un testimonio de oración. Se
// renderiza como una tarjeta con CTA en el feed y al pulsar lleva a `url`.
//
// Idempotente por `linked.type` + `linked.refId`: reintentos o dobles disparos
// no duplican el post. Best-effort: nunca lanza.

export type LinkedPostType = 'activity' | 'plan' | 'prayer' | 'answered';

interface LinkedPostInput {
  authorId: string;
  type: LinkedPostType;
  refId: string; // id del origen (o `${groupId}:${planKey}` para planes)
  groupId?: string | null;
  groupName?: string;
  groupImage?: string | null;
  title?: string;
  body?: string;
  url: string;
}

function escapeHtml(s = ''): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function createLinkedPost(input: LinkedPostInput): Promise<void> {
  try {
    const { authorId, type, refId, groupId, groupName = '', groupImage = null, title = '', body = '', url } = input;
    if (!authorId || !type || !refId || !url) return;

    const refKey = String(refId);
    const existing = await Post.findOne({ 'linked.type': type, 'linked.refId': refKey });
    if (existing) return;

    await Post.create({
      author: authorId,
      content: `<p>${escapeHtml(body || title)}</p>`,
      isRichText: true,
      linked: {
        type,
        refId: refKey,
        groupId: groupId || undefined,
        groupName,
        groupImage: groupImage || undefined,
        title,
        url,
      },
    });
  } catch (err) {
    console.error('createLinkedPost:', err);
  }
}

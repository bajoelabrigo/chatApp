import mongoose from 'mongoose';

// Crea un post AUTOMÁTICO en la colección `posts` (dominio de la web `holy_app`,
// misma base de datos compartida) que enlaza algo ocurrido en un grupo: una
// actividad, un plan de lectura, una petición o un testimonio de oración. Se
// renderiza como una tarjeta con CTA en el feed y al pulsar lleva a `url`.
//
// El chat-backend NO tiene el modelo Post (es de la web), así que se escribe por
// la colección cruda — el mismo patrón que `cleanWebDomainReferences`. Por eso
// hay que poner a mano los campos que el schema pondría por defecto (arrays,
// shareCounts): un `insertOne` no dispara los defaults de Mongoose, y el lector
// del feed hace `.map` sobre esos arrays.
//
// Idempotente por `linked.type` + `linked.refId`: reintentos o dobles disparos no
// duplican el post. Best-effort: nunca lanza.

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

const ZERO_SHARE_COUNTS = {
  facebook: 0, messenger: 0, twitter: 0, telegram: 0, whatsapp: 0,
  pinterest: 0, email: 0, threads: 0, linkedin: 0, webshare: 0,
};

function escapeHtml(s = ''): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function createLinkedPost(input: LinkedPostInput): Promise<void> {
  try {
    const { authorId, type, refId, groupId, groupName = '', groupImage = null, title = '', body = '', url } = input;
    if (!authorId || !type || !refId || !url) return;

    const db = mongoose.connection.db;
    if (!db) return;
    const posts = db.collection('posts');

    const refKey = String(refId);
    const existing = await posts.findOne({ 'linked.type': type, 'linked.refId': refKey });
    if (existing) return;

    const now = new Date();
    await posts.insertOne({
      author: new mongoose.Types.ObjectId(authorId),
      content: `<p>${escapeHtml(body || title)}</p>`,
      isRichText: true,
      likes: [],
      sharedBy: [],
      reactions: [],
      comments: [],
      savedBy: [],
      shareCounts: { ...ZERO_SHARE_COUNTS },
      linked: {
        type,
        refId: refKey,
        groupId: groupId ? new mongoose.Types.ObjectId(groupId) : null,
        groupName,
        groupImage: groupImage || null,
        title,
        url,
      },
      createdAt: now,
      updatedAt: now,
      __v: 0,
    });
  } catch (err) {
    console.error('createLinkedPost:', err);
  }
}

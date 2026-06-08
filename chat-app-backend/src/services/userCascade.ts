import mongoose from 'mongoose';

/**
 * Limpia las referencias del DOMINIO WEB (red social) al borrar un usuario.
 * El dominio del chat (conversaciones, mensajes, compromisos, etc.) lo maneja
 * `deleteAccount` directamente con los modelos del móvil.
 *
 * Se usa acceso crudo a colecciones porque este backend no modela las de la web.
 * Cada paso es best-effort: si una colección/campo no aplica, se registra y sigue.
 */
export async function cleanWebDomainReferences(
  userId: string | mongoose.Types.ObjectId
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const uid = new mongoose.Types.ObjectId(userId);
  const col = (n: string) => db.collection(n);
  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[cleanWebDomainReferences] ${label}:`, (e as Error)?.message);
    }
  };

  // Publicaciones propias + quitar likes/guardados/comentarios en las de otros
  await safe('posts-own', () => col('posts').deleteMany({ author: uid }));
  await safe('posts-arrays', () =>
    col('posts').updateMany({}, { $pull: { likes: uid, savedBy: uid, comments: { user: uid } } } as any)
  );
  // Solicitudes de conexión
  await safe('connectionrequests', () =>
    col('connectionrequests').deleteMany({ $or: [{ sender: uid }, { recipient: uid }] })
  );
  // Notificaciones
  await safe('notifications', () =>
    col('notifications').deleteMany({ $or: [{ recipient: uid }, { relatedUser: uid }] })
  );
  // Peticiones de oración (web)
  await safe('petitions-own', () => col('petitions').deleteMany({ userId: uid }));
  await safe('petitions-praying', () =>
    col('petitions').updateMany({}, { $pull: { prayingUsers: uid } } as any)
  );
  // Sacarlo de followers/following/connections de los demás
  await safe('users-social', () =>
    col('users').updateMany({}, { $pull: { followers: uid, following: uid, connections: uid } } as any)
  );
  // Tokens (verificación/reseteo de la web)
  await safe('tokens', () => col('tokens').deleteMany({ userId: uid }));
  // Chat de la web (colecciones renombradas)
  await safe('web_conv-direct', async () => {
    const ids = (
      await col('web_conversations').find({ isGroup: false, participants: uid }).project({ _id: 1 }).toArray()
    ).map((d) => d._id);
    if (ids.length) {
      await col('web_messages').deleteMany({ conversationId: { $in: ids } });
      await col('web_conversations').deleteMany({ _id: { $in: ids } });
    }
  });
  await safe('web_conv-group', () =>
    col('web_conversations').updateMany(
      { isGroup: true, participants: uid },
      { $pull: { participants: uid, admin: uid } } as any
    )
  );
  await safe('web_messages', () =>
    col('web_messages').deleteMany({ $or: [{ senderId: uid }, { receiverId: uid }] })
  );
}

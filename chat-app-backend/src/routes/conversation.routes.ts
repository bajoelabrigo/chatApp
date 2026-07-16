import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getConversations,
  createOrGetConversation,
  getMessages,
  searchMessages,
  searchUsers,
  getSuggestedUsers,
  getAllUsersSearch,
  togglePin,
  toggleArchive,
  toggleFavorite,
  toggleMute,
  setUnread,
  clearConversation,
  deleteConversationForMe,
  markAllRead,
  searchAllMessages,
} from '../controllers/conversationController';
import { getGroupDailyVerse, reactGroupDailyVerse } from '../controllers/dailyVerseChatController';

const router = Router();

router.use(authMiddleware);

// Versículo del día en el chat del grupo (tarjeta fija + reacciones compartidas).
router.get('/:id/daily-verse', getGroupDailyVerse);
router.post('/:id/daily-verse/react', reactGroupDailyVerse);

router.get('/', getConversations);
router.post('/', createOrGetConversation);
// Búsqueda global de mensajes (antes de las rutas con :conversationId para
// evitar que "/search/messages" sea capturado por "/:conversationId/messages").
router.get('/search/messages', searchAllMessages);
router.get('/:conversationId/messages', getMessages);
router.get('/:conversationId/messages/search', searchMessages);
router.patch('/:id/pin', togglePin);
router.patch('/:id/archive', toggleArchive);
router.patch('/:id/favorite', toggleFavorite);
router.patch('/:id/mute', toggleMute);
router.patch('/:id/unread', setUnread);
// "Vaciar chat" (solo mis mensajes) y "Eliminar chat" (además lo saca de mi lista).
router.delete('/:id/messages', clearConversation);
router.delete('/:id', deleteConversationForMe);
router.patch('/mark-all-read', markAllRead);

router.get('/users/search', searchUsers);
router.get('/users/suggested', getSuggestedUsers);
router.get('/users/all', getAllUsersSearch);

export default router;

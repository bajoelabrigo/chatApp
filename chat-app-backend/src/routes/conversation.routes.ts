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
  markAllRead,
  searchAllMessages,
} from '../controllers/conversationController';

const router = Router();

router.use(authMiddleware);

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
router.patch('/mark-all-read', markAllRead);

router.get('/users/search', searchUsers);
router.get('/users/suggested', getSuggestedUsers);
router.get('/users/all', getAllUsersSearch);

export default router;

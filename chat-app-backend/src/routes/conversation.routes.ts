import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getConversations,
  createOrGetConversation,
  getMessages,
  searchUsers,
  togglePin,
  toggleArchive,
  toggleFavorite,
  toggleMute,
} from '../controllers/conversationController';

const router = Router();

router.use(authMiddleware);

router.get('/', getConversations);
router.post('/', createOrGetConversation);
router.get('/:conversationId/messages', getMessages);
router.patch('/:id/pin', togglePin);
router.patch('/:id/archive', toggleArchive);
router.patch('/:id/favorite', toggleFavorite);
router.patch('/:id/mute', toggleMute);

router.get('/users/search', searchUsers);

export default router;

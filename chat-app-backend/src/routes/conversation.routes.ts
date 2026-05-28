import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getConversations,
  createOrGetConversation,
  getMessages,
  searchUsers,
  getSuggestedUsers,
  getAllUsersSearch,
  togglePin,
  toggleArchive,
  toggleFavorite,
  toggleMute,
  markAllRead,
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
router.patch('/mark-all-read', markAllRead);

router.get('/users/search', searchUsers);
router.get('/users/suggested', getSuggestedUsers);
router.get('/users/all', getAllUsersSearch);

export default router;

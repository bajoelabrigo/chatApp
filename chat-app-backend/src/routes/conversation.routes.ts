import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getConversations,
  createOrGetConversation,
  getMessages,
  searchUsers,
} from '../controllers/conversationController';

const router = Router();

router.use(authMiddleware);

router.get('/', getConversations);
router.post('/', createOrGetConversation);
router.get('/:conversationId/messages', getMessages);

router.get('/users/search', searchUsers);

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getUserContent } from '../controllers/adminController';

const router = Router();

router.use(authMiddleware);
router.get('/users/:userId/content', getUserContent);

export default router;

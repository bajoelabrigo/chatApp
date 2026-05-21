import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getGroupCallToken } from '../controllers/callController';

const router = Router();
router.use(authMiddleware);
router.post('/group-token', getGroupCallToken);
export default router;

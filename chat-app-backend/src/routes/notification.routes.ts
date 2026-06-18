import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getNotifications, markNotificationsSeen } from '../controllers/notificationController';

const router = Router();

router.use(authMiddleware);
router.get('/', getNotifications);
router.post('/seen', markNotificationsSeen);

export default router;

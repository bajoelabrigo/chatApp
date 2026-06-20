import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getNotifications,
  markNotificationsSeen,
  markNotificationRead,
  dismissNotification,
} from '../controllers/notificationController';

const router = Router();

router.use(authMiddleware);
router.get('/', getNotifications);
router.post('/seen', markNotificationsSeen);
router.post('/read', markNotificationRead);
router.post('/dismiss', dismissNotification);

export default router;

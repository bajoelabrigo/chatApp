import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getPrayerRequests,
  createPrayerRequest,
  deletePrayerRequest,
  togglePray,
  markAnswered,
} from '../controllers/prayerController';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', getPrayerRequests);
router.post('/', createPrayerRequest);
router.delete('/:requestId', deletePrayerRequest);
router.post('/:requestId/pray', togglePray);
router.patch('/:requestId/answer', markAnswered);

export default router;

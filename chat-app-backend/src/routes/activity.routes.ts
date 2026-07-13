import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  commitToActivity,
  cancelCommitment,
  getActivityCommitments,
  getMyCommitments,
  getGroupSummary,
} from '../controllers/activityController';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', getActivities);
router.post('/', createActivity);
// Resumen para la franja del chat del grupo (cuántas actividades y peticiones
// hay abiertas, y si YO ya participo). Va antes de `/:activityId`.
router.get('/summary', getGroupSummary);
router.get('/my-commitments', getMyCommitments);
router.patch('/:activityId', updateActivity);
router.delete('/:activityId', deleteActivity);
router.post('/:activityId/commit', commitToActivity);
router.delete('/:activityId/commit', cancelCommitment);
router.get('/:activityId/commitments', getActivityCommitments);

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  listSeminars,
  listMySeminars,
  getSeminarDetails,
  getSeminarClasses,
  joinSeminar,
  leaveSeminar,
  markClassCompleted,
  getMyProgress,
  getMyCertificate,
  uploadTask,
  deleteMyTask,
  updateStudentComment,
  getMyTaskForClass,
} from '../controllers/seminarController';

const router = Router();

router.use(authMiddleware);

router.get('/', listSeminars);
router.get('/mine', listMySeminars);
router.get('/:id', getSeminarDetails);
router.get('/:id/classes', getSeminarClasses);
router.post('/:id/join', joinSeminar);
router.patch('/:id/leave', leaveSeminar);
router.patch('/:id/classes/:classId/mark-completed', markClassCompleted);
router.get('/:id/progress', getMyProgress);
router.get('/:id/certificate', getMyCertificate);
router.post('/:id/classes/:classId/task', uploadTask);
router.delete('/:id/classes/:classId/task', deleteMyTask);
router.patch('/:id/classes/:classId/student-comment', updateStudentComment);
router.get('/:id/classes/:classId/my-task', getMyTaskForClass);

export default router;

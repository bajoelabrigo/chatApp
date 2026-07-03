import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createGroup, getGroupInfo, updateGroup,
  addGroupMembers, removeGroupMember, toggleAdmin,
  deleteGroup, leaveGroup, reportGroup, joinGroup,
  getPendingMembers, approvePendingMember, rejectPendingMember,
  getGroupMedia,
} from '../controllers/groupController';

const router = Router();

router.use(authMiddleware);
router.post('/', createGroup);
router.get('/:id', getGroupInfo);
router.get('/:id/media', getGroupMedia);
router.patch('/:id', updateGroup);
router.delete('/:id', deleteGroup);
router.post('/:id/join', joinGroup);
router.get('/:id/pending', getPendingMembers);
router.post('/:id/pending/:memberId/approve', approvePendingMember);
router.post('/:id/pending/:memberId/reject', rejectPendingMember);
router.post('/:id/leave', leaveGroup);
router.post('/:id/report', reportGroup);
router.post('/:id/members', addGroupMembers);
router.delete('/:id/members/:memberId', removeGroupMember);
router.patch('/:id/members/:memberId/admin', toggleAdmin);

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createGroup, getGroupInfo, updateGroup,
  addGroupMembers, removeGroupMember, toggleAdmin,
  deleteGroup, leaveGroup, reportGroup,
} from '../controllers/groupController';

const router = Router();

router.use(authMiddleware);
router.post('/', createGroup);
router.get('/:id', getGroupInfo);
router.patch('/:id', updateGroup);
router.delete('/:id', deleteGroup);
router.post('/:id/leave', leaveGroup);
router.post('/:id/report', reportGroup);
router.post('/:id/members', addGroupMembers);
router.delete('/:id/members/:memberId', removeGroupMember);
router.patch('/:id/members/:memberId/admin', toggleAdmin);

export default router;

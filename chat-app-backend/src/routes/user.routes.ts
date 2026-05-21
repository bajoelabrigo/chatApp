import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { toggleBlock, getBlockedUsers, updatePushToken, getAllMyCommitments, getUserProfile, reportUser } from '../controllers/userController';

const router = Router();

router.use(authMiddleware);
router.get('/blocked', getBlockedUsers);
router.patch('/block/:targetUserId', toggleBlock);
router.patch('/push-token', updatePushToken);
router.get('/my-commitments', getAllMyCommitments);
router.get('/:userId', getUserProfile);
router.post('/:userId/report', reportUser);

export default router;

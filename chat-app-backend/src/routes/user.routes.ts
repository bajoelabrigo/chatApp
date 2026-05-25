import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { toggleBlock, getBlockedUsers, updatePushToken, getAllMyCommitments, getUserProfile, reportUser, getMyProfile, updateMyProfile, getMySettings, updateSettings } from '../controllers/userController';
import { getPersonalActivities, createPersonalActivity, updatePersonalActivity, deletePersonalActivity } from '../controllers/personalActivityController';

const router = Router();

router.use(authMiddleware);
router.get('/blocked', getBlockedUsers);
router.patch('/block/:targetUserId', toggleBlock);
router.patch('/push-token', updatePushToken);
router.get('/my-commitments', getAllMyCommitments);
router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);
router.get('/me/settings', getMySettings);
router.patch('/me/settings', updateSettings);
router.get('/me/activities', getPersonalActivities);
router.post('/me/activities', createPersonalActivity);
router.patch('/me/activities/:id', updatePersonalActivity);
router.delete('/me/activities/:id', deletePersonalActivity);
router.get('/:userId', getUserProfile);
router.post('/:userId/report', reportUser);

export default router;

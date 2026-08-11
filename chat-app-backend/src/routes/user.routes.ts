import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { toggleBlock, getBlockedUsers, updatePushToken, getAllMyCommitments, getUserProfile, reportUser, getMyProfile, updateMyProfile, getMySettings, updateSettings, changePassword, deleteAccount, getMyConnections, getSocioWelcome, markSocioWelcomeSeen, getSocioReminder, followUser, unfollowUser, getFollowStatus } from '../controllers/userController';
import { getPersonalActivities, createPersonalActivity, updatePersonalActivity, deletePersonalActivity } from '../controllers/personalActivityController';
import { getMyActivePrayerRequests, getPrayerFeed } from '../controllers/prayerController';
import { getActivityFeed } from '../controllers/activityController';

const router = Router();

router.use(authMiddleware);
router.get('/blocked', getBlockedUsers);
router.patch('/block/:targetUserId', toggleBlock);
router.patch('/push-token', updatePushToken);
router.get('/my-commitments', getAllMyCommitments);
router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);
router.delete('/me', deleteAccount);
router.patch('/me/password', changePassword);
router.get('/me/settings', getMySettings);
router.patch('/me/settings', updateSettings);
router.get('/me/activities', getPersonalActivities);
router.get('/me/prayer-requests', getMyActivePrayerRequests);
router.get('/me/prayer-feed', getPrayerFeed);
router.get('/me/activity-feed', getActivityFeed);
router.get('/me/connections', getMyConnections);
router.post('/follow/:userId', followUser);
router.post('/unfollow/:userId', unfollowUser);
router.get('/follow/status/:userId', getFollowStatus);
router.get('/me/socio-welcome', getSocioWelcome);
router.post('/me/socio-welcome/seen', markSocioWelcomeSeen);
router.get('/me/socio-reminder', getSocioReminder);
router.post('/me/activities', createPersonalActivity);
router.patch('/me/activities/:id', updatePersonalActivity);
router.delete('/me/activities/:id', deletePersonalActivity);
router.get('/:userId', getUserProfile);
router.post('/:userId/report', reportUser);

export default router;

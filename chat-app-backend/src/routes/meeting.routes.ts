import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createMeeting,
  listMyMeetings,
  getMeeting,
  updateMeeting,
  getMeetingToken,
  admitParticipant,
  muteParticipant,
  removeParticipant,
  endMeeting,
  deleteMeeting,
} from '../controllers/meetingController';

const router = Router();
router.use(authMiddleware);

router.post('/', createMeeting);
router.get('/', listMyMeetings);
router.get('/:code', getMeeting);
router.patch('/:code', updateMeeting);
router.post('/:code/token', getMeetingToken);
router.post('/:code/admit', admitParticipant);
router.post('/:code/mute', muteParticipant);
router.post('/:code/remove', removeParticipant);
router.post('/:code/end', endMeeting);
router.delete('/:code', deleteMeeting);

export default router;

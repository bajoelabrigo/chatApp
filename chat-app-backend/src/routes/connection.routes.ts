import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  cancelConnectionRequest,
  getConnectionRequests,
  getUserConnections,
  removeConnection,
  getConnectionStatus,
} from '../controllers/connectionController';

const router = Router();

router.use(authMiddleware);

router.post('/request/:userId', sendConnectionRequest);
router.put('/accept/:requestId', acceptConnectionRequest);
router.put('/reject/:requestId', rejectConnectionRequest);
router.delete('/request/:requestId', cancelConnectionRequest);
router.get('/request', getConnectionRequests);
router.get('/status/:userId', getConnectionStatus);
router.get('/', getUserConnections);
router.delete('/:userId', removeConnection);

export default router;

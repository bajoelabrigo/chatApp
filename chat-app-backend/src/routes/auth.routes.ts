import { Router } from 'express';
import { googleSignIn, refreshToken, getMe } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/google-signin', googleSignIn);
router.post('/refresh', refreshToken);
router.get('/me', authMiddleware, getMe);

export default router;

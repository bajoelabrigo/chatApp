import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  googleSignIn, login, register, verifyEmail, resendCode,
  forgotPassword, resetPassword, refreshToken, getMe,
} from '../controllers/authController';

const router = Router();

router.post('/google-signin', googleSignIn);
router.post('/register',      register);
router.post('/verify-email',  verifyEmail);
router.post('/resend-code',   resendCode);
router.post('/login',         login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.post('/refresh',       refreshToken);
router.get('/me', authMiddleware, getMe);

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { loginLimiter, codeCheckLimiter, emailSendLimiter } from '../middleware/rateLimit';
import {
  googleSignIn, login, register, verifyEmail, resendCode,
  forgotPassword, resetPassword, refreshToken, getMe,
} from '../controllers/authController';

const router = Router();

router.post('/google-signin', googleSignIn);
router.post('/register',      emailSendLimiter, register);
router.post('/verify-email',  codeCheckLimiter, verifyEmail);
router.post('/resend-code',   emailSendLimiter, resendCode);
router.post('/login',         loginLimiter, login);
router.post('/forgot-password', emailSendLimiter, forgotPassword);
router.post('/reset-password',  codeCheckLimiter, resetPassword);
router.post('/refresh',       refreshToken);
router.get('/me', authMiddleware, getMe);

export default router;

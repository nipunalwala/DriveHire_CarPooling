import { Router } from 'express';
import {
  forgotPasswordHandler,
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resendOtpHandler,
  resetPasswordHandler,
  verifyOtpHandler
} from '../controllers/authController';
import { authenticate, requireActive } from '../middleware/authenticate';
import { authLimiter, createRateLimiter } from '../middleware/rateLimits';
import { verifyRefreshOrigin } from '../middleware/csrf';
export const authRoutes = Router();
authRoutes.post('/register', authLimiter, registerHandler);
authRoutes.post('/verify-otp', authLimiter, verifyOtpHandler);
authRoutes.post('/resend-otp', authLimiter, resendOtpHandler);
authRoutes.post('/login', authLimiter, loginHandler);
authRoutes.post('/refresh', createRateLimiter(30), verifyRefreshOrigin, refreshHandler);
authRoutes.post('/logout', authenticate, logoutHandler);
authRoutes.post('/logout-all', authenticate, requireActive, logoutAllHandler);
authRoutes.post('/forgot-password', authLimiter, forgotPasswordHandler);
authRoutes.post('/reset-password', authLimiter, resetPasswordHandler);

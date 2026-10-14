import { Router } from 'express';
import { getMe, patchMe } from '../controllers/userController';
import { authenticate, requireActive } from '../middleware/authenticate';
import multer from 'multer';
import { uploadAvatar, getAvatar } from '../controllers/avatarController';
import { uploadLimiter } from '../middleware/rateLimits';
import { changePasswordHandler } from '../controllers/authController';
export const userRoutes = Router();
userRoutes.use(authenticate, requireActive);
userRoutes.get('/me', getMe);
userRoutes.patch('/me', patchMe);
userRoutes.post('/me/change-password', changePasswordHandler);
userRoutes.post(
  '/me/avatar',
  uploadLimiter,
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
  }).single('avatar'),
  uploadAvatar
);
userRoutes.get('/me/avatar', getAvatar);

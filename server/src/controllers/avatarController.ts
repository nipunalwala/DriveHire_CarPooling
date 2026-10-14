import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { readAvatar, saveAvatar } from '../services/authService';
export const uploadAvatar: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('VALIDATION_ERROR', 400, 'Choose a profile image first');
    const result = await saveAvatar(req.user!.sub, req.file);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
export const getAvatar: RequestHandler = async (req, res, next) => {
  try {
    const result = await readAvatar(req.user!.sub);
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
};

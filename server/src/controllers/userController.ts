import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { currentProfile, editProfile } from '../services/authService';
const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional()
  })
  .strict();
export const getMe: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: { user: await currentProfile(req.user!.sub) } });
  } catch (error) {
    next(error);
  }
};
export const patchMe: RequestHandler = async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Please check your profile details',
        parsed.error.flatten()
      );
    const result = await editProfile(req.user!.sub, parsed.data);
    res.json({ success: true, data: { user: result } });
  } catch (error) {
    next(error);
  }
};

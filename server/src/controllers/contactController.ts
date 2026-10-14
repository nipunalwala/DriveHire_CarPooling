import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { sendContactMessage } from '../services/contactService';
const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    message: z.string().trim().min(10).max(5000)
  })
  .strict();
export const createContactMessage: RequestHandler = async (req, res, next) => {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Please check your contact details',
        parsed.error.flatten()
      );
    await sendContactMessage(parsed.data);
    res
      .status(201)
      .json({
        success: true,
        data: { message: 'Thanks for reaching out. We’ll be in touch soon.' }
      });
  } catch (error) {
    next(error);
  }
};

import { Router } from 'express';
import { createContactMessage } from '../controllers/contactController';
import { createRateLimiter } from '../middleware/rateLimits';
export const contactRoutes = Router();
contactRoutes.post('/', createRateLimiter(5), createContactMessage);

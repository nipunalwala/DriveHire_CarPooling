import { z } from 'zod';

export const CitySchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  country: z.string().min(1).max(2),
  timezone: z.string().min(1).max(60),
});

export type CityDto = z.infer<typeof CitySchema>;

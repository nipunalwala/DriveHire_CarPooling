import { z } from 'zod';
import { AppError } from '../errors/AppError';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .regex(/^[a-zA-Z_]+:(asc|desc)$/)
    .optional()
});
export type Pagination = z.infer<typeof paginationSchema>;
export function parsePagination(query: unknown, allowedSorts: readonly string[] = []): Pagination {
  const result = paginationSchema.safeParse(query);
  if (!result.success)
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Invalid pagination parameters',
      result.error.flatten()
    );
  if (result.data.sort && !allowedSorts.includes(result.data.sort.split(':')[0]!))
    throw new AppError('VALIDATION_ERROR', 400, 'Unsupported sort field');
  return result.data;
}
export function pageBounds({ page, limit }: Pagination): { offset: number; limit: number } {
  return { offset: (page - 1) * limit, limit };
}

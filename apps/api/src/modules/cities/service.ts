import { z } from 'zod';
import { CitySchema, type CityDto, type Page, type PageMeta } from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest } from '../../errors.js';

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function toCityDto(row: {
  id: string;
  name: string;
  region: string;
  country: string;
  timezone: string;
}): CityDto {
  return CitySchema.parse(row);
}

export interface CitiesService {
  list(query: Record<string, string>): Promise<Page<CityDto>>;
}

export function createCitiesService({ prisma }: { prisma: PrismaClient }): CitiesService {
  return {
    async list(query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const where = { active: true };
      const [total, rows] = await Promise.all([
        prisma.city.count({ where }),
        prisma.city.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
          select: { id: true, name: true, region: true, country: true, timezone: true },
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data: rows.map(toCityDto), meta };
    },
  };
}

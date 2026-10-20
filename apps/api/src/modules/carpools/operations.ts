import { z } from 'zod';
import { CarpoolStatusSchema } from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { currentRoles } from '../bookings/commitments.js';
import { carpoolDto } from './service.js';
const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: CarpoolStatusSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export async function adminCarpools(prisma: PrismaClient, account: CurrentAccount, query: unknown) {
  await currentRoles(prisma, account, 'ADMIN');
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) throw badRequest('Invalid operations filters');
  const { page, pageSize, status, from, to } = parsed.data;
  if (from && to && new Date(from) > new Date(to)) throw badRequest('From must precede To');
  const where = {
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          startsAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };
  const [total, rides] = await Promise.all([
    prisma.carpool.count({ where }),
    prisma.carpool.findMany({
      where,
      include: { trips: true },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    success: true,
    data: await Promise.all(rides.map((ride) => carpoolDto(prisma, ride))),
    meta: { page, pageSize, total },
  };
}

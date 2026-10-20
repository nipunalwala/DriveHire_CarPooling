import { VersionReasonInputSchema } from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { conflict, HttpError, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { currentRoles } from '../bookings/commitments.js';
import { withLockedCarpool } from './seats.js';
import { carpoolDto } from './service.js';
import { terminalizeCarpool } from './terminal.js';
export function createCarpoolLifecycle({ prisma }: { prisma: PrismaClient }) {
  return {
    async cancelCarpool(account: CurrentAccount, id: string, input: unknown, requestId: string) {
      const parsed = VersionReasonInputSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(
          422,
          'UNPROCESSABLE_ENTITY',
          'Current version and valid reason required',
        );
      return withLockedCarpool(prisma, id, account.userId, async (tx, ride) => {
        const roles = await currentRoles(tx, account),
          admin = roles.includes('ADMIN');
        if (ride.hostId !== account.userId && !admin) throw notFound();
        if (ride.status === 'CANCELLED') return carpoolDto(tx, ride);
        if (ride.version !== parsed.data.version)
          throw conflict('Ride changed; reload before cancelling');
        if (
          !['DRAFT', 'PUBLISHED'].includes(ride.status) ||
          !['SCHEDULED', 'ASSIGNED'].includes(ride.trips[0]?.status ?? '')
        )
          throw conflict('Only an unstarted ride can be cancelled');
        const reason = parsed.data.reason?.trim();
        if (admin && !reason)
          throw new HttpError(
            422,
            'UNPROCESSABLE_ENTITY',
            'Administrator cancellation requires a reason',
          );
        await terminalizeCarpool(
          tx,
          ride,
          'CANCELLED',
          account.userId,
          reason ?? 'Host cancelled the ride',
          requestId,
        );
        return carpoolDto(
          tx,
          await tx.carpool.findUniqueOrThrow({ where: { id }, include: { trips: true } }),
        );
      });
    },
  };
}

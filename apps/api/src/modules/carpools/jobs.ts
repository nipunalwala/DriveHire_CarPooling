import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { HttpError } from '../../errors.js';
import { assertStartEligibility, qualificationPredicate } from '../bookings/commitments.js';
import { withLockedCarpool } from './seats.js';
import { databaseNow } from './service.js';
import { flagCarpoolIncident, terminalizeCarpool } from './terminal.js';
/** Called under the shared journey reconciliation lease in expireBookings. */
export async function reconcileCarpools(prisma: PrismaClient): Promise<number> {
  const candidates = await prisma.$queryRaw<{ id: string; hostId: string }[]>(Prisma.sql`
 SELECT c.id,c.host_id AS "hostId" FROM carpools c JOIN trips t ON t.carpool_id=c.id
 JOIN driver_profiles d ON d.id=c.driver_id JOIN users du ON du.id=d.user_id JOIN cities dc ON dc.id=d.city_id
 JOIN vehicles v ON v.id=c.vehicle_id JOIN users vu ON vu.id=v.owner_id JOIN cities vc ON vc.id=v.city_id
 WHERE c.status='PUBLISHED' AND (
 (t.status='ASSIGNED' AND (c.starts_at<=clock_timestamp()-interval '30 minutes' OR NOT COALESCE(${qualificationPredicate()},false))) OR
 (t.status IN ('STARTED','IN_TRANSIT') AND NOT t.incident_flag AND (t.ends_at<=clock_timestamp() OR NOT COALESCE(${qualificationPredicate()},false))))
 ORDER BY c.starts_at,c.id LIMIT 100`);
  let terminalized = 0;
  for (const candidate of candidates) {
    const changed = await withLockedCarpool(
      prisma,
      candidate.id,
      candidate.hostId,
      async (tx, ride) => {
        if (ride.status !== 'PUBLISHED') return false;
        const now = await databaseNow(tx),
          trip = ride.trips[0];
        if (!trip) return false;
        let eligible = true;
        try {
          await assertStartEligibility(tx, ride.driverId, ride.vehicleId);
        } catch (error) {
          if (error instanceof HttpError && error.code === 'QUALIFICATION_INVALID')
            eligible = false;
          else throw error;
        }
        const overdue = now.getTime() >= trip.endsAt.getTime();
        if (['STARTED', 'IN_TRANSIT'].includes(trip.status)) {
          if ((!eligible || overdue) && !trip.incidentFlag) {
            let reason = eligible
              ? 'Active trip exceeded its planned end'
              : 'Active trip qualification changed';
            if (overdue) {
              const until = new Date(now.getTime() + 15 * 60000);
              const conflicts = await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT id FROM resource_reservations WHERE released_at IS NULL AND carpool_id IS DISTINCT FROM ${ride.id}::uuid AND (driver_id=${ride.driverId}::uuid OR vehicle_id=${ride.vehicleId}::uuid) AND starts_at<${until} AND ends_at>${trip.startsAt} LIMIT 1`,
              );
              if (!conflicts.length)
                await tx.resourceReservation.updateMany({
                  where: { carpoolId: ride.id, releasedAt: null, endsAt: { lt: until } },
                  data: { endsAt: until },
                });
              else
                reason +=
                  '; adjacent reservation prevents extending the interval; physical guard retained';
            }
            await flagCarpoolIncident(tx, ride, null, reason, 'carpool-reconcile');
          }
          return false;
        }
        if (trip.status !== 'ASSIGNED') return false;
        if (now.getTime() >= ride.startsAt.getTime() + 30 * 60000)
          return terminalizeCarpool(
            tx,
            ride,
            'EXPIRED',
            null,
            'Unstarted carpool exceeded its start grace',
            'carpool-reconcile',
          );
        if (!eligible)
          return terminalizeCarpool(
            tx,
            ride,
            'CANCELLED',
            null,
            'Current host qualification is invalid',
            'carpool-reconcile',
          );
        return false;
      },
    );
    if (changed) terminalized++;
  }
  return terminalized;
}

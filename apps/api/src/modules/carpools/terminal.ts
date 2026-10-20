import type { Prisma } from '../../generated/client/client.js';
export type TerminalRide = Prisma.CarpoolGetPayload<{ include: { trips: true } }>;
export async function terminalizeCarpool(
  tx: Prisma.TransactionClient,
  ride: TerminalRide,
  status: 'CANCELLED' | 'EXPIRED',
  actorId: string | null,
  reason: string,
  requestId: string,
) {
  const trip = ride.trips[0];
  if (
    !trip ||
    !['SCHEDULED', 'ASSIGNED'].includes(trip.status) ||
    !['DRAFT', 'PUBLISHED'].includes(ride.status)
  )
    return false;
  const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0]!.now;
  await tx.seatRequest.updateMany({
    where: { carpoolId: ride.id, status: 'ACCEPTED' },
    data: {
      status: status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED',
      reason,
      version: { increment: 1 },
    },
  });
  await tx.carpool.update({
    where: { id: ride.id },
    data: { status, confirmedSeats: 0, version: { increment: 1 } },
  });
  await tx.trip.update({ where: { id: trip.id }, data: { status, version: { increment: 1 } } });
  await tx.resourceReservation.updateMany({
    where: { carpoolId: ride.id, releasedAt: null },
    data: { releasedAt: now },
  });
  await tx.tripStatusHistory.create({
    data: {
      tripId: trip.id,
      fromStatus: trip.status,
      toStatus: status,
      actorId,
      actorType: actorId ? 'USER' : 'WORKER',
      reason,
      requestId,
      tripVersion: trip.version + 1,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      actorType: actorId ? 'USER' : 'WORKER',
      action: `CARPOOL_${status}`,
      subjectType: 'CARPOOL',
      subjectId: ride.id,
      reason,
      requestId,
    },
  });
  return true;
}
export async function flagCarpoolIncident(
  tx: Prisma.TransactionClient,
  ride: TerminalRide,
  actorId: string | null,
  reason: string,
  requestId: string,
) {
  const trip = ride.trips[0];
  if (!trip || trip.incidentFlag || !['STARTED', 'IN_TRANSIT'].includes(trip.status)) return;
  await tx.trip.update({
    where: { id: trip.id },
    data: { incidentFlag: true, version: { increment: 1 } },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      actorType: actorId ? 'USER' : 'WORKER',
      action: 'TRIP_INCIDENT_FLAGGED',
      subjectType: 'trip',
      subjectId: trip.id,
      reason,
      requestId,
    },
  });
}

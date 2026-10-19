import { Prisma } from '../../generated/client/client.js';
import { HttpError, forbidden } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { withResourceLocks } from './locks.js';

type Tx = Prisma.TransactionClient;
export async function currentRoles(
  tx: Tx,
  account: CurrentAccount,
  role?: string,
): Promise<string[]> {
  const user = await tx.user.findUnique({
    where: { id: account.userId },
    include: { roles: true },
  });
  const roles = user?.roles.map((entry) => entry.role) ?? [];
  if (!user || user.status !== 'ACTIVE' || (role && !roles.includes(role))) {
    throw forbidden('Account access is no longer active');
  }
  return roles;
}

/** Existing commitments ignore listing preference, but never current evidence or account eligibility. */
export async function assertStartEligibility(
  tx: Tx,
  driverId: string,
  vehicleId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ eligible: boolean }[]>(Prisma.sql`
    SELECT (du.status='ACTIVE' AND vu.status='ACTIVE'
      AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=du.id AND ur.role='DRIVER')
      AND d.verification_status='APPROVED' AND v.verification_status='APPROVED' AND v.archived_at IS NULL
      AND d.license_expires_on >= (clock_timestamp() AT TIME ZONE dc.timezone)::date
      AND EXISTS (SELECT 1 FROM verification_requests vr WHERE vr.id=d.current_verification_id AND vr.status='APPROVED')
      AND EXISTS (SELECT 1 FROM verification_requests vr WHERE vr.id=v.current_verification_id AND vr.status='APPROVED')
      AND EXISTS (SELECT 1 FROM verification_documents vd JOIN documents doc ON doc.id=vd.document_id
        WHERE vd.verification_id=d.current_verification_id AND doc.driver_id=d.id AND doc.kind='LICENSE'
          AND doc.scan_status='CLEAN' AND doc.retired_at IS NULL
          AND (doc.expires_on IS NULL OR doc.expires_on >= (clock_timestamp() AT TIME ZONE dc.timezone)::date))
      AND EXISTS (SELECT 1 FROM verification_documents vd JOIN documents doc ON doc.id=vd.document_id
        WHERE vd.verification_id=v.current_verification_id AND doc.vehicle_id=v.id AND doc.kind='REGISTRATION'
          AND doc.scan_status='CLEAN' AND doc.retired_at IS NULL)
      AND EXISTS (SELECT 1 FROM verification_documents vd JOIN documents doc ON doc.id=vd.document_id
        WHERE vd.verification_id=v.current_verification_id AND doc.vehicle_id=v.id AND doc.kind='INSURANCE'
          AND doc.scan_status='CLEAN' AND doc.retired_at IS NULL
          AND doc.expires_on >= (clock_timestamp() AT TIME ZONE vc.timezone)::date)
    ) AS eligible
    FROM driver_profiles d JOIN users du ON du.id=d.user_id JOIN cities dc ON dc.id=d.city_id
    JOIN vehicles v ON v.id=${vehicleId}::uuid JOIN users vu ON vu.id=v.owner_id JOIN cities vc ON vc.id=v.city_id
    WHERE d.id=${driverId}::uuid`);
  if (rows[0]?.eligible !== true) {
    throw new HttpError(
      409,
      'QUALIFICATION_INVALID',
      'Current accounts, qualification and evidence must be valid before starting',
    );
  }
}

async function suspensionGraph(tx: Tx, targetId: string, actorId: string) {
  const [drivers, vehicles] = await Promise.all([
    tx.driverProfile.findMany({ where: { userId: targetId }, select: { id: true } }),
    tx.vehicle.findMany({ where: { ownerId: targetId }, select: { id: true } }),
  ]);
  const bookings = await tx.booking.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      OR: [
        { passengerId: targetId },
        { driverId: { in: drivers.map((row) => row.id) } },
        { vehicleId: { in: vehicles.map((row) => row.id) } },
      ],
    },
    select: { id: true, driverId: true, vehicleId: true, passengerId: true },
  });
  const driverIds = [
    ...new Set([...drivers.map((row) => row.id), ...bookings.map((row) => row.driverId)]),
  ];
  const vehicleIds = [
    ...new Set([...vehicles.map((row) => row.id), ...bookings.map((row) => row.vehicleId)]),
  ];
  const [relatedDrivers, relatedVehicles] = await Promise.all([
    tx.driverProfile.findMany({ where: { id: { in: driverIds } }, select: { userId: true } }),
    tx.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { ownerId: true } }),
  ]);
  const userIds = [
    ...new Set([
      targetId,
      actorId,
      ...bookings.map((row) => row.passengerId),
      ...relatedDrivers.map((row) => row.userId),
      ...relatedVehicles.map((row) => row.ownerId),
    ]),
  ];
  return { userIds, driverIds, vehicleIds, bookingIds: bookings.map((row) => row.id) };
}

/** Retry discovery if a commitment committed before suspension acquired its account gate. */
export async function withSuspensionResources<T>(
  tx: Tx,
  targetId: string,
  actorId: string,
  run: () => Promise<T>,
): Promise<T> {
  const graph = await suspensionGraph(tx, targetId, actorId);
  return withResourceLocks(tx, graph, async () => {
    const current = await suspensionGraph(tx, targetId, actorId);
    if (
      current.userIds.some((id) => !graph.userIds.includes(id)) ||
      current.driverIds.some((id) => !graph.driverIds.includes(id)) ||
      current.vehicleIds.some((id) => !graph.vehicleIds.includes(id))
    ) {
      throw Object.assign(new Error('Suspension resource graph changed'), { code: 'P2034' });
    }
    if (current.bookingIds.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM bookings WHERE id IN (${Prisma.join(current.bookingIds)}) ORDER BY id FOR UPDATE`,
      );
    return run();
  });
}

export async function resolveSuspendedBookings(
  tx: Tx,
  targetId: string,
  actorId: string,
  reason: string,
  requestId: string,
): Promise<void> {
  const graph = await suspensionGraph(tx, targetId, actorId);
  const bookings = await tx.booking.findMany({
    where: { id: { in: graph.bookingIds } },
    include: { trips: true },
    orderBy: { id: 'asc' },
  });
  const now = (await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`))[0]!
    .now;
  for (const booking of bookings) {
    const trip = booking.trips[0];
    if (!trip) continue;
    const active = ['STARTED', 'IN_TRANSIT'].includes(trip.status);
    if (active) {
      if (trip.incidentFlag) continue;
      await tx.trip.update({
        where: { id: trip.id },
        data: { incidentFlag: true, version: { increment: 1 } },
      });
    } else if (['SCHEDULED', 'ASSIGNED'].includes(trip.status)) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelReason: reason, version: { increment: 1 } },
      });
      await tx.trip.update({
        where: { id: trip.id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      await tx.tripStatusHistory.create({
        data: {
          tripId: trip.id,
          fromStatus: trip.status,
          toStatus: 'CANCELLED',
          actorId,
          actorType: 'USER',
          reason,
          tripVersion: trip.version + 1,
          requestId,
        },
      });
      await tx.resourceReservation.updateMany({
        where: { bookingId: booking.id, releasedAt: null },
        data: { releasedAt: now },
      });
    } else continue;
    await tx.auditLog.create({
      data: {
        actorId,
        actorType: 'USER',
        action: active ? 'TRIP_INCIDENT_FLAGGED' : 'BOOKING_CANCELLED',
        subjectType: active ? 'trip' : 'booking',
        subjectId: active ? trip.id : booking.id,
        reason,
        requestId,
      },
    });
  }
}

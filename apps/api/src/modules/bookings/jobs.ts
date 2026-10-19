import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { withResourceLocks } from './locks.js';

// System expiry/reconciliation worker. Every final decision is taken against
// database time inside a resource-locked transaction, never the caller's clock:
// pending requests expire at expires_at, unstarted ASSIGNED/SCHEDULED trips
// expire at starts_at+30min, and expired qualification or account suspension
// cancels unstarted commitments while active physical use is only incident
// flagged for deliberate administrator resolution. STARTED/IN_TRANSIT trips are
// never expired or completed by this job. Repeated runs and worker replay are
// harmless because each row is CAS-guarded and reservations are released once.

const JOB_NAME = 'expire-bookings';
const REQUEST_ID = 'expiry-job';
const START_GRACE_MS = 30 * 60 * 1000;
const CANDIDATE_LIMIT = 100;

const ACTIVE_TRIP_STATUSES = ['STARTED', 'IN_TRANSIT'] as const;
const UNSTARTED_TRIP_STATUSES = ['SCHEDULED', 'ASSIGNED'] as const;

interface EligibilityRow {
  passengerActive: boolean;
  driverActive: boolean;
  driverApproved: boolean;
  licenseValid: boolean;
  vehicleApproved: boolean;
  insuranceValid: boolean;
}

async function databaseNow(db: PrismaClient | Prisma.TransactionClient): Promise<Date> {
  const rows = await db.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT now() AS now`);
  return rows[0]?.now ?? new Date();
}

async function acquireLease(prisma: PrismaClient, owner: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
    INSERT INTO job_leases (name, owner, lease_until, heartbeat_at)
    VALUES (${JOB_NAME}, ${owner}, now() + interval '30 seconds', now())
    ON CONFLICT (name) DO UPDATE
      SET owner = EXCLUDED.owner,
          lease_until = EXCLUDED.lease_until,
          heartbeat_at = EXCLUDED.heartbeat_at
      WHERE job_leases.lease_until < now() OR job_leases.owner = EXCLUDED.owner
    RETURNING name`);
  return rows.length === 1;
}

async function releaseLease(prisma: PrismaClient, owner: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`UPDATE job_leases SET lease_until = now(), heartbeat_at = now()
      WHERE name = ${JOB_NAME} AND owner = ${owner}`,
  );
}

function eligibilityViolation(): Prisma.Sql {
  return Prisma.sql`(
    pu.status <> 'ACTIVE'
    OR du.status <> 'ACTIVE'
    OR d.verification_status <> 'APPROVED'
    OR d.license_expires_on IS NULL
    OR d.license_expires_on < (now() AT TIME ZONE COALESCE(dc.timezone, 'UTC'))::date
    OR v.verification_status <> 'APPROVED'
    OR v.archived_at IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM verification_documents vd
      JOIN documents ins ON ins.id = vd.document_id
      WHERE vd.verification_id = v.current_verification_id
        AND ins.vehicle_id = v.id
        AND ins.kind = 'INSURANCE'
        AND ins.scan_status = 'CLEAN'
        AND ins.retired_at IS NULL
        AND ins.expires_on IS NOT NULL
        AND ins.expires_on >= (now() AT TIME ZONE COALESCE(vc.timezone, 'UTC'))::date
    )
  )`;
}

async function ineligibleBookingIds(prisma: PrismaClient, active: boolean): Promise<string[]> {
  const bookingStatuses = active ? 'CONFIRMED' : 'PENDING, CONFIRMED';
  const tripStatuses = active ? 'STARTED, IN_TRANSIT' : 'SCHEDULED, ASSIGNED';
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b.id
    FROM bookings b
    JOIN trips t ON t.booking_id = b.id
    JOIN users pu ON pu.id = b.passenger_id
    JOIN driver_profiles d ON d.id = b.driver_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN cities dc ON dc.id = d.city_id
    JOIN vehicles v ON v.id = b.vehicle_id
    LEFT JOIN cities vc ON vc.id = v.city_id
    WHERE b.status IN (${Prisma.raw(`'${bookingStatuses.replaceAll(', ', "','")}'`)})
      AND t.status IN (${Prisma.raw(`'${tripStatuses.replaceAll(', ', "','")}'`)})
      AND ${eligibilityViolation()}
      AND (${!active} OR t.incident_flag = false)
    ORDER BY b.starts_at ASC
    LIMIT ${CANDIDATE_LIMIT}`);
  return rows.map((row) => row.id);
}

async function ineligibilityReason(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<EligibilityRow[]>(Prisma.sql`
    SELECT pu.status = 'ACTIVE' AS "passengerActive",
           du.status = 'ACTIVE' AS "driverActive",
           d.verification_status = 'APPROVED' AS "driverApproved",
           (d.license_expires_on IS NOT NULL
             AND d.license_expires_on >= (now() AT TIME ZONE COALESCE(dc.timezone, 'UTC'))::date)
             AS "licenseValid",
           (v.verification_status = 'APPROVED' AND v.archived_at IS NULL) AS "vehicleApproved",
           EXISTS (
             SELECT 1
             FROM verification_documents vd
             JOIN documents ins ON ins.id = vd.document_id
             WHERE vd.verification_id = v.current_verification_id
               AND ins.vehicle_id = v.id
               AND ins.kind = 'INSURANCE'
               AND ins.scan_status = 'CLEAN'
               AND ins.retired_at IS NULL
               AND ins.expires_on IS NOT NULL
               AND ins.expires_on >= (now() AT TIME ZONE COALESCE(vc.timezone, 'UTC'))::date
           ) AS "insuranceValid"
    FROM bookings b
    JOIN users pu ON pu.id = b.passenger_id
    JOIN driver_profiles d ON d.id = b.driver_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN cities dc ON dc.id = d.city_id
    JOIN vehicles v ON v.id = b.vehicle_id
    LEFT JOIN cities vc ON vc.id = v.city_id
    WHERE b.id = ${bookingId}::uuid`);
  const row = rows[0];
  if (!row) return 'Booking resources are no longer available';
  if (!row.passengerActive) return 'Passenger account is not active';
  if (!row.driverActive) return 'Driver account is not active';
  if (!row.driverApproved) return 'Driver qualification is no longer approved';
  if (!row.licenseValid) return 'Driver license is expired';
  if (!row.vehicleApproved) return 'Vehicle qualification is no longer approved';
  if (!row.insuranceValid) return 'Vehicle insurance is expired';
  return null;
}

type TerminalMode = 'PENDING_EXPIRY' | 'OVERDUE_EXPIRY' | 'INELIGIBLE_CANCEL';

async function terminalizeBooking(
  prisma: PrismaClient,
  bookingId: string,
  mode: TerminalMode,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Discover the lock set before locking, then use the canonical order.
    const discovered = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { passengerId: true, driverId: true, vehicleId: true },
    });
    if (!discovered) return false;
    const [driver, vehicle] = await Promise.all([
      tx.driverProfile.findUnique({
        where: { id: discovered.driverId },
        select: { userId: true },
      }),
      tx.vehicle.findUnique({
        where: { id: discovered.vehicleId },
        select: { ownerId: true },
      }),
    ]);

    return withResourceLocks(
      tx,
      {
        userIds: [discovered.passengerId, driver?.userId, vehicle?.ownerId].filter(
          (value): value is string => Boolean(value),
        ),
        driverIds: [discovered.driverId],
        vehicleIds: [discovered.vehicleId],
      },
      async () => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`,
        );
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { decisions: true, trips: true },
        });
        if (!booking) return false;
        const trip = booking.trips[0];
        if (!trip) return false;
        if (ACTIVE_TRIP_STATUSES.includes(trip.status as (typeof ACTIVE_TRIP_STATUSES)[number])) {
          return false;
        }
        if (
          !UNSTARTED_TRIP_STATUSES.includes(trip.status as (typeof UNSTARTED_TRIP_STATUSES)[number])
        ) {
          return false;
        }

        const now = await databaseNow(tx);
        let reason: string;
        let action: string;
        let finalStatus: 'EXPIRED' | 'CANCELLED';
        if (mode === 'PENDING_EXPIRY') {
          if (booking.status !== 'PENDING') return false;
          if (booking.expiresAt.getTime() > now.getTime()) return false;
          reason = 'Booking request expired';
          action = 'BOOKING_EXPIRED';
          finalStatus = 'EXPIRED';
        } else if (mode === 'OVERDUE_EXPIRY') {
          if (booking.status !== 'CONFIRMED') return false;
          if (booking.startsAt.getTime() + START_GRACE_MS > now.getTime()) return false;
          reason = 'Unstarted booking expired';
          action = 'BOOKING_EXPIRED';
          finalStatus = 'EXPIRED';
        } else {
          if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return false;
          const invalid = await ineligibilityReason(tx, booking.id);
          if (!invalid) return false;
          reason = invalid;
          action = 'BOOKING_CANCELLED';
          finalStatus = 'CANCELLED';
        }

        const updated = await tx.booking.updateMany({
          where: { id: booking.id, version: booking.version, status: booking.status },
          data: {
            status: finalStatus,
            cancelReason: reason,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return false;

        const tripUpdated = await tx.trip.updateMany({
          where: { id: trip.id, version: trip.version, status: trip.status },
          data: { status: finalStatus, version: { increment: 1 } },
        });
        if (tripUpdated.count !== 1) throw new Error('Trip changed during expiry');

        await tx.tripStatusHistory.create({
          data: {
            tripId: trip.id,
            fromStatus: trip.status,
            toStatus: finalStatus,
            actorId: null,
            actorType: 'WORKER',
            reason,
            tripVersion: trip.version + 1,
            requestId: REQUEST_ID,
          },
        });
        await tx.resourceReservation.updateMany({
          where: { bookingId: booking.id, releasedAt: null },
          data: { releasedAt: now },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            actorType: 'WORKER',
            action,
            subjectType: 'booking',
            subjectId: booking.id,
            reason,
            requestId: REQUEST_ID,
            beforeSafe: { status: booking.status, version: booking.version },
            afterSafe: { status: finalStatus, version: booking.version + 1 },
          },
        });
        return true;
      },
    );
  });
}

async function flagActiveIncident(prisma: PrismaClient, bookingId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const discovered = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { passengerId: true, driverId: true, vehicleId: true },
    });
    if (!discovered) return false;
    const [driver, vehicle] = await Promise.all([
      tx.driverProfile.findUnique({
        where: { id: discovered.driverId },
        select: { userId: true },
      }),
      tx.vehicle.findUnique({
        where: { id: discovered.vehicleId },
        select: { ownerId: true },
      }),
    ]);

    return withResourceLocks(
      tx,
      {
        userIds: [discovered.passengerId, driver?.userId, vehicle?.ownerId].filter(
          (value): value is string => Boolean(value),
        ),
        driverIds: [discovered.driverId],
        vehicleIds: [discovered.vehicleId],
      },
      async () => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`,
        );
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { trips: true },
        });
        if (!booking) return false;
        const trip = booking.trips[0];
        if (!trip) return false;
        if (!ACTIVE_TRIP_STATUSES.includes(trip.status as (typeof ACTIVE_TRIP_STATUSES)[number])) {
          return false;
        }
        if (trip.incidentFlag) return false;
        const now = (
          await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`)
        )[0]!.now;
        const overdue = trip.endsAt <= now;
        let reason = await ineligibilityReason(tx, booking.id);
        if (!reason && !overdue) return false;
        reason ??= 'Active trip exceeded its planned end';
        if (overdue) {
          const holds = await tx.resourceReservation.findMany({
            where: { bookingId: booking.id, releasedAt: null },
          });
          const extension = new Date(now.getTime() + 15 * 60_000);
          const conflict = holds.length
            ? await tx.resourceReservation.findFirst({
                where: {
                  id: { notIn: holds.map((hold) => hold.id) },
                  releasedAt: null,
                  OR: [{ driverId: trip.driverId }, { vehicleId: trip.vehicleId }],
                  startsAt: { lt: extension },
                  endsAt: { gt: new Date(Math.min(...holds.map((hold) => hold.endsAt.getTime()))) },
                },
                select: { id: true },
              })
            : null;
          if (!conflict) {
            await tx.resourceReservation.updateMany({
              where: { bookingId: booking.id, releasedAt: null, endsAt: { lt: extension } },
              data: { endsAt: extension },
            });
          } else reason += '; reservation extension conflicts with another commitment';
        }

        const updated = await tx.trip.updateMany({
          where: {
            id: trip.id,
            version: trip.version,
            status: trip.status,
            incidentFlag: false,
          },
          data: { incidentFlag: true, version: { increment: 1 } },
        });
        if (updated.count !== 1) return false;

        await tx.auditLog.create({
          data: {
            actorId: null,
            actorType: 'WORKER',
            action: 'TRIP_INCIDENT_FLAGGED',
            subjectType: 'trip',
            subjectId: trip.id,
            reason,
            requestId: REQUEST_ID,
            beforeSafe: {
              status: trip.status,
              version: trip.version,
              incidentFlag: false,
            },
            afterSafe: {
              status: trip.status,
              version: trip.version + 1,
              incidentFlag: true,
            },
          },
        });
        return true;
      },
    );
  });
}

/**
 * Expire/reconcile bookings with database time as the final authority. The
 * `requestedAt` argument is accepted for the historical worker contract but is
 * deliberately not used for any status/expiry decision.
 */
export async function expireBookings(requestedAt: Date, prisma: PrismaClient): Promise<number> {
  // Keep the historical caller contract explicit without letting a skewed
  // process clock decide state.
  void requestedAt;
  const owner = randomUUID();
  if (!(await acquireLease(prisma, owner))) return 0;
  try {
    const now = await databaseNow(prisma);
    const pending = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
        trips: { some: { status: { in: [...UNSTARTED_TRIP_STATUSES] } } },
      },
      select: { id: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: CANDIDATE_LIMIT,
    });
    const overdue = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { lte: new Date(now.getTime() - START_GRACE_MS) },
        trips: { some: { status: { in: [...UNSTARTED_TRIP_STATUSES] } } },
      },
      select: { id: true },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: CANDIDATE_LIMIT,
    });
    const ineligible = await ineligibleBookingIds(prisma, false);

    const seen = new Set<string>();
    let expired = 0;
    const pendingIds = new Set(pending.map((row) => row.id));
    const overdueIds = new Set(overdue.map((row) => row.id));
    for (const id of [
      ...pending.map((row) => row.id),
      ...overdue.map((row) => row.id),
      ...ineligible,
    ]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const mode: TerminalMode = pendingIds.has(id)
        ? 'PENDING_EXPIRY'
        : overdueIds.has(id)
          ? 'OVERDUE_EXPIRY'
          : 'INELIGIBLE_CANCEL';
      if (await terminalizeBooking(prisma, id, mode)) expired += 1;
    }

    // Active physical use is never released by the clock. Ineligibility or
    // suspension only raises the incident flag once for administrator action.
    const activeOverdue = await prisma.trip.findMany({
      where: {
        bookingId: { not: null },
        status: { in: [...ACTIVE_TRIP_STATUSES] },
        endsAt: { lte: now },
        incidentFlag: false,
      },
      select: { bookingId: true },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      take: CANDIDATE_LIMIT,
    });
    const activeCandidates = new Set([
      ...(await ineligibleBookingIds(prisma, true)),
      ...activeOverdue.map((trip) => trip.bookingId!),
    ]);
    for (const id of activeCandidates) await flagActiveIncident(prisma, id);
    return expired;
  } finally {
    await releaseLease(prisma, owner);
  }
}

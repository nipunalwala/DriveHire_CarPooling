import type { BookingDecisionDto, BookingDto, TripDto } from '@drivehire/contracts';
import type { Prisma } from '../../generated/client/client.js';

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: { decisions: true; trips: true };
}>;

export function toDecisionDto(decision: {
  providerId: string;
  kind: string;
  status: string;
  decidedAt: Date | null;
}): BookingDecisionDto {
  return {
    providerId: decision.providerId,
    kind: 'DRIVER',
    status: decision.status as BookingDecisionDto['status'],
    decidedAt: decision.decidedAt?.toISOString() ?? null,
  };
}

export function toTripDto(trip: {
  id: string;
  bookingId: string | null;
  carpoolId: string | null;
  driverId: string;
  vehicleId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  version: number;
  incidentFlag: boolean;
}): TripDto {
  return {
    id: trip.id,
    kind: trip.carpoolId ? 'CARPOOL' : 'BOOKING',
    status: trip.status as TripDto['status'],
    driverId: trip.driverId,
    vehicleId: trip.vehicleId,
    startsAt: trip.startsAt.toISOString(),
    endsAt: trip.endsAt.toISOString(),
    version: trip.version,
    incidentFlag: trip.incidentFlag,
  };
}

export function toBookingDto(booking: BookingWithRelations): BookingDto {
  const trip = booking.trips[0];
  const decision = booking.decisions[0];
  if (!trip) throw new Error('Booking has no trip');
  if (!decision) throw new Error('Booking has no driver decision');
  return {
    id: booking.id,
    passengerId: booking.passengerId,
    service: 'DRIVER_HIRE',
    vehicleId: booking.vehicleId,
    driverId: booking.driverId,
    tripId: trip.id,
    status: booking.status as BookingDto['status'],
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalMinor: Number(booking.totalMinor),
    currency: 'INR',
    expiresAt: booking.expiresAt.toISOString(),
    version: booking.version,
    paymentStatus: 'NOT_COLLECTED',
    decisions: [toDecisionDto(decision)],
  };
}

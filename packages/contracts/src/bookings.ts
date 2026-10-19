import { z } from 'zod';

// Driver-hiring contracts, hand-mapped to the active OpenAPI schemas
// QuoteInput, Quote, BookingInput, Booking and BookingDecision. Only the
// approved DRIVER_HIRE service is representable; no rental or combined mode.

const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());

export const BookingServiceSchema = z.literal('DRIVER_HIRE');
export const BookingStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'FAILED',
]);
export const BookingPaymentStatusSchema = z.literal('NOT_COLLECTED');
export const BookingDecisionStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);

export const QuoteInputSchema = z.strictObject({
  service: BookingServiceSchema,
  vehicleId: z.uuid(),
  driverId: z.uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  originCityId: z.uuid(),
  destinationCityId: z.uuid(),
  passengers: z.number().int().min(1).max(11),
});

export const QuoteSchema = z.strictObject({
  id: z.uuid(),
  service: BookingServiceSchema,
  vehicleId: z.uuid(),
  driverId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  billableHours: z.number().int().min(1).max(720),
  driverSubtotalMinor: z.number().int().min(0).max(100_000_000),
  totalMinor: z.number().int().min(0).max(100_000_000),
  currency: z.literal('INR'),
  expiresAt: z.iso.datetime(),
  paymentStatus: BookingPaymentStatusSchema,
});

export const BookingInputSchema = z.strictObject({
  quoteId: z.uuid(),
});

export const BookingDecisionInputSchema = z.strictObject({
  decision: z.enum(['ACCEPT', 'REJECT']),
  version: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().min(10).max(1000).optional(),
});

export const BookingDecisionSchema = z.strictObject({
  providerId: z.uuid(),
  kind: z.literal('DRIVER'),
  status: BookingDecisionStatusSchema,
  decidedAt: z.iso.datetime().nullable(),
});

export const TripKindSchema = z.enum(['BOOKING', 'CARPOOL']);
export const TripStatusSchema = z.enum([
  'SCHEDULED',
  'ASSIGNED',
  'STARTED',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'FAILED',
]);

export const TripSchema = z.strictObject({
  id: z.uuid(),
  kind: TripKindSchema,
  status: TripStatusSchema,
  driverId: z.uuid(),
  vehicleId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  version: z.number().int().min(1).max(2_147_483_647),
  incidentFlag: z.boolean(),
});

export type TripDto = z.infer<typeof TripSchema>;

export const TransitionInputSchema = z.strictObject({
  toStatus: z.enum(['STARTED', 'IN_TRANSIT', 'COMPLETED', 'FAILED']),
  version: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().min(10).max(1000).optional(),
});

export type TransitionInput = z.infer<typeof TransitionInputSchema>;

export const HistoryEntrySchema = z.strictObject({
  id: z.uuid(),
  fromStatus: z.string().min(1).max(30),
  toStatus: z.string().min(1).max(30),
  actorId: z.uuid().nullable(),
  reason: z.string().min(1).max(1000).optional(),
  createdAt: z.iso.datetime(),
});

export type HistoryEntryDto = z.infer<typeof HistoryEntrySchema>;

export const BookingSchema = z.strictObject({
  id: z.uuid(),
  passengerId: z.uuid(),
  service: BookingServiceSchema,
  vehicleId: z.uuid(),
  driverId: z.uuid(),
  tripId: z.uuid(),
  status: BookingStatusSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  totalMinor: z.number().int().min(0).max(100_000_000),
  currency: z.literal('INR'),
  expiresAt: z.iso.datetime(),
  version: z.number().int().min(1).max(2_147_483_647),
  paymentStatus: BookingPaymentStatusSchema,
  decisions: z.array(BookingDecisionSchema).min(1).max(1),
});

export type QuoteInput = z.infer<typeof QuoteInputSchema>;
export type QuoteDto = z.infer<typeof QuoteSchema>;
export type BookingInput = z.infer<typeof BookingInputSchema>;
export type BookingDecisionDto = z.infer<typeof BookingDecisionSchema>;
export type BookingDto = z.infer<typeof BookingSchema>;

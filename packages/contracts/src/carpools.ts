import { z } from 'zod';
export const CarpoolInputSchema = z.strictObject({
  vehicleId: z.uuid(),
  originCityId: z.uuid(),
  destinationCityId: z.uuid(),
  pickupNote: z.string().trim().min(1).max(300),
  dropoffNote: z.string().trim().min(1).max(300),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  seatsOffered: z.number().int().min(1).max(11),
  pricePerSeatMinor: z.number().int().min(0).max(100_000_000),
  joinMode: z.literal('INSTANT'),
  version: z.number().int().min(1).max(2147483647).optional(),
});
export const CarpoolStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED',
  'FAILED',
]);
export const CarpoolSchema = z.strictObject({
  id: z.uuid(),
  hostId: z.uuid(),
  vehicleId: z.uuid(),
  tripId: z.uuid(),
  originCityId: z.uuid(),
  destinationCityId: z.uuid(),
  pickupNote: z.string().min(1).max(300),
  dropoffNote: z.string().min(1).max(300),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  seatsOffered: z.number().int().min(1).max(11),
  confirmedSeats: z.number().int().min(0).max(11),
  availableSeats: z.number().int().min(0).max(11),
  pricePerSeatMinor: z.number().int().min(0).max(100_000_000),
  currency: z.literal('INR'),
  joinMode: z.literal('INSTANT'),
  status: CarpoolStatusSchema,
  version: z.number().int().min(1),
  hostDisplayName: z.string().min(1).max(120),
  vehicleSummary: z.strictObject({
    make: z.string(),
    model: z.string(),
    seats: z.number().int().min(2).max(12),
  }),
});
export const SeatInputSchema = z.strictObject({
  seats: z.number().int().min(1).max(11),
  message: z.string().min(1).max(500).optional(),
});
export const SeatRequestSchema = z.strictObject({
  id: z.uuid(),
  carpoolId: z.uuid(),
  passengerId: z.uuid(),
  passengerDisplayName: z.string().min(1).max(120).optional(),
  seats: z.number().int().min(1).max(11),
  status: z.enum(['ACCEPTED', 'CANCELLED', 'EXPIRED']),
  version: z.number().int().min(1),
  pricePerSeatMinor: z.number().int().min(0).max(100_000_000),
});
export type CarpoolInput = z.infer<typeof CarpoolInputSchema>;
export type CarpoolDto = z.infer<typeof CarpoolSchema>;
export type SeatInput = z.infer<typeof SeatInputSchema>;
export type SeatRequestDto = z.infer<typeof SeatRequestSchema>;

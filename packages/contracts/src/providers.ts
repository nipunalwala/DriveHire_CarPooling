import { z } from 'zod';

// Provider onboarding / qualification contracts. Every schema is hand-mapped to
// the active OpenAPI (docs/api/openapi.json): DriverInput, Driver, DriverPrivate,
// VehicleInput, VehiclePrivate, Document, AvailabilityInput, Availability,
// Verification, VerificationDecisionInput, ListingInput, ReasonInput,
// VersionReasonInput. Nothing beyond the active OpenAPI is added.

export const VerificationStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
export const DocumentScanStatusSchema = z.enum(['PENDING', 'CLEAN', 'REJECTED']);
export const VehicleCategorySchema = z.enum(['HATCHBACK', 'SEDAN', 'SUV', 'VAN']);
export const TransmissionSchema = z.enum(['MANUAL', 'AUTOMATIC']);
export const FuelTypeSchema = z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID']);
export const AvailabilityKindSchema = z.enum(['AVAILABLE', 'BLOCKED']);
export const VerificationSubjectTypeSchema = z.enum(['DRIVER', 'VEHICLE']);
export const DocumentKindSchema = z.enum(['LICENSE', 'REGISTRATION', 'INSURANCE']);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date');
const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());

// --- Driver -----------------------------------------------------------------

export const DriverInputSchema = z.strictObject({
  licenseNumber: z.string().min(1).max(40),
  licenseCountry: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  licenseExpiresOn: isoDate,
  serviceCityId: z.uuid(),
  hourlyRateMinor: z.number().int().min(1).max(10_000_000),
  bio: z.string().min(1).max(1000).optional(),
  version: z.number().int().min(1).max(2_147_483_647).optional(),
});

export const DriverSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().min(1).max(80),
  cityId: z.uuid(),
  verificationStatus: VerificationStatusSchema,
  hourlyRateMinor: z.number().int().min(0).max(100_000_000),
  currency: z.literal('INR'),
  acceptingBookings: z.boolean(),
  bio: z.string().min(1).max(1000).optional(),
  version: z.number().int().min(1).max(2_147_483_647),
});

export const DriverPrivateSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().min(1).max(80),
  cityId: z.uuid().nullable(),
  verificationStatus: VerificationStatusSchema,
  hourlyRateMinor: z.number().int().min(0).max(100_000_000).nullable(),
  currency: z.literal('INR'),
  acceptingBookings: z.boolean(),
  bio: z.string().min(1).max(1000).optional(),
  version: z.number().int().min(1).max(2_147_483_647),
  licenseNumber: z.string().min(1).max(40).nullable(),
  licenseCountry: z.string().min(1).max(2).nullable(),
  licenseExpiresOn: isoDate.nullable(),
  verificationReason: z.string().min(1).max(1000).optional(),
});

export const ListingInputSchema = z.strictObject({
  enabled: z.boolean(),
  version: z.number().int().min(1).max(2_147_483_647),
});

// --- Vehicle ----------------------------------------------------------------

export const VehicleInputSchema = z.strictObject({
  registrationNumber: z.string().min(1).max(30),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1990).max(2100),
  category: VehicleCategorySchema,
  seats: z.number().int().min(2).max(12),
  transmission: TransmissionSchema,
  fuelType: FuelTypeSchema,
  cityId: z.uuid(),
  description: z.string().min(1).max(1500).optional(),
  version: z.number().int().min(1).max(2_147_483_647).optional(),
});

export const VehiclePrivateSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1990).max(2100),
  category: z.string().min(1).max(20),
  seats: z.number().int().min(2).max(12),
  transmission: z.string().min(1).max(20),
  fuelType: z.string().min(1).max(20),
  cityId: z.uuid(),
  verificationStatus: VerificationStatusSchema,
  archivedAt: z.iso.datetime().nullable().optional(),
  version: z.number().int().min(1).max(2_147_483_647),
  registrationNumber: z.string().min(1).max(30),
  description: z.string().min(1).max(1500).optional(),
  verificationReason: z.string().min(1).max(1000).optional(),
});

// --- Documents --------------------------------------------------------------

export const DocumentSchema = z.strictObject({
  id: z.uuid(),
  kind: z.string().min(1).max(40),
  scanStatus: DocumentScanStatusSchema,
  createdAt: z.iso.datetime(),
  expiresOn: isoDate.optional(),
});

// --- Availability -----------------------------------------------------------

export const AvailabilityInputSchema = z.strictObject({
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  kind: AvailabilityKindSchema,
});

export const AvailabilitySchema = z.strictObject({
  id: z.uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  kind: AvailabilityKindSchema,
});

// --- Verification -----------------------------------------------------------

export const VerificationSchema = z.strictObject({
  id: z.uuid(),
  subjectType: VerificationSubjectTypeSchema,
  subjectId: z.uuid(),
  status: VerificationStatusSchema,
  version: z.number().int().min(1).max(2_147_483_647),
  documentIds: z.array(z.uuid()).max(8),
  submittedAt: z.iso.datetime(),
  reason: z.string().min(1).max(1000).optional(),
});

export const VerificationDecisionInputSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  version: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().min(10).max(1000),
});

export const ReasonInputSchema = z.strictObject({
  reason: z.string().min(10).max(1000),
});

export const AuditEntrySchema = z.strictObject({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  action: z.string().min(1).max(100),
  subjectType: z.string().min(1).max(60),
  subjectId: z.uuid(),
  reason: z.string().min(1).max(1000).optional(),
  requestId: z.string().min(1).max(80),
  createdAt: z.iso.datetime(),
});

export const VersionReasonInputSchema = z.strictObject({
  version: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().min(10).max(1000),
});

export const VersionInputSchema = z.strictObject({
  version: z.number().int().min(1).max(2_147_483_647),
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type DocumentScanStatus = z.infer<typeof DocumentScanStatusSchema>;
export type AvailabilityKind = z.infer<typeof AvailabilityKindSchema>;
export type DocumentKind = z.infer<typeof DocumentKindSchema>;
export type DriverInput = z.infer<typeof DriverInputSchema>;
export type DriverDto = z.infer<typeof DriverSchema>;
export type DriverPrivateDto = z.infer<typeof DriverPrivateSchema>;
export type ListingInput = z.infer<typeof ListingInputSchema>;
export type VehicleInput = z.infer<typeof VehicleInputSchema>;
export type VehiclePrivateDto = z.infer<typeof VehiclePrivateSchema>;
export type DocumentDto = z.infer<typeof DocumentSchema>;
export type AvailabilityInput = z.infer<typeof AvailabilityInputSchema>;
export type AvailabilityDto = z.infer<typeof AvailabilitySchema>;
export type VerificationDto = z.infer<typeof VerificationSchema>;
export type AuditEntryDto = z.infer<typeof AuditEntrySchema>;
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionInputSchema>;
export type ReasonInput = z.infer<typeof ReasonInputSchema>;
export type VersionReasonInput = z.infer<typeof VersionReasonInputSchema>;
export type VersionInput = z.infer<typeof VersionInputSchema>;

import { Readable } from 'node:stream';
import { z } from 'zod';
import {
  DriverInputSchema,
  ListingInputSchema,
  VehicleInputSchema,
  VersionInputSchema,
  type DocumentDto,
  type DriverDto,
  type DriverPrivateDto,
  type Page,
  type PageMeta,
  type VehiclePrivateDto,
  type VerificationDto,
} from '@drivehire/contracts';
import type { Config } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/client/client.js';
import type { ScanAdapter, StorageAdapter } from '../../ports.js';
import { badRequest, conflict, notFound, HttpError } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { sanitizeEvidence, EvidenceTypeError } from './evidence.js';
import { decryptIdentifier, encryptIdentifier, identifierDigest } from './registration-crypto.js';
import { toAsyncIterable } from '../../adapters/private-storage.js';

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// `${today}T00:00:00Z` compares cleanly against @db.Date values.
function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function todayDate(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}
function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface DocumentContent {
  stream: Readable;
  contentType: string;
  filename: string;
}

export interface ProvidersService {
  getMyDriver(account: CurrentAccount): Promise<DriverPrivateDto>;
  upsertDriver(account: CurrentAccount, input: unknown): Promise<DriverPrivateDto>;
  setDriverListing(account: CurrentAccount, input: unknown): Promise<DriverPrivateDto>;
  listDriverDocuments(
    account: CurrentAccount,
    query: Record<string, string>,
  ): Promise<Page<DocumentDto>>;
  uploadDriverDocument(account: CurrentAccount, input: UploadInput): Promise<DocumentDto>;
  submitDriverVerification(account: CurrentAccount, input: unknown): Promise<VerificationDto>;
  searchDrivers(query: Record<string, string>): Promise<Page<DriverDto>>;
  getDriver(id: string): Promise<DriverDto>;
  createVehicle(account: CurrentAccount, input: unknown): Promise<VehiclePrivateDto>;
  updateVehicle(account: CurrentAccount, id: string, input: unknown): Promise<VehiclePrivateDto>;
  archiveVehicle(account: CurrentAccount, id: string): Promise<{ acknowledged: true }>;
  listMyVehicles(
    account: CurrentAccount,
    query: Record<string, string>,
  ): Promise<Page<VehiclePrivateDto>>;
  listVehicleDocuments(
    account: CurrentAccount,
    vehicleId: string,
    query: Record<string, string>,
  ): Promise<Page<DocumentDto>>;
  uploadVehicleDocument(
    account: CurrentAccount,
    vehicleId: string,
    input: UploadInput,
  ): Promise<DocumentDto>;
  submitVehicleVerification(
    account: CurrentAccount,
    vehicleId: string,
    input: unknown,
  ): Promise<VerificationDto>;
  getDocumentContent(account: CurrentAccount, id: string): Promise<DocumentContent>;
  retireDocument(account: CurrentAccount, id: string): Promise<{ acknowledged: true }>;
  scanPendingDocuments(signal: AbortSignal): Promise<void>;
  cleanupOrphanUploads(): Promise<void>;
  expireQualifications(): Promise<void>;
}

export interface UploadInput {
  kind: string;
  declaredContentType: string;
  bytes: Buffer;
  expiresOn?: string;
}

export interface ProviderDeps {
  prisma: PrismaClient;
  config: Config;
  storage: StorageAdapter;
  scanner: ScanAdapter;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export function createProvidersService({
  prisma,
  config,
  storage,
  scanner,
}: ProviderDeps): ProvidersService {
  const key = config.authOutboxKey;

  function licenseAad(userId: string): string {
    return `driver-license:${userId}`;
  }
  function registrationAad(digest: string): string {
    return `vehicle-registration:${digest}`;
  }

  function toDocumentDto(row: {
    id: string;
    kind: string;
    scanStatus: string;
    createdAt: Date;
    expiresOn: Date | null;
  }): DocumentDto {
    const dto: DocumentDto = {
      id: row.id,
      kind: row.kind,
      scanStatus: row.scanStatus as DocumentDto['scanStatus'],
      createdAt: row.createdAt.toISOString(),
    };
    if (row.expiresOn) dto.expiresOn = isoDateOnly(row.expiresOn);
    return dto;
  }

  type DriverRow = {
    id: string;
    userId: string;
    licenseCiphertext: string | null;
    licenseDigest: string | null;
    licenseCountry: string | null;
    licenseExpiresOn: Date | null;
    cityId: string | null;
    hourlyRateMinor: number | null;
    verificationStatus: string;
    acceptingBookings: boolean;
    version: number;
  };

  async function driverPrivate(driver: DriverRow, displayName: string): Promise<DriverPrivateDto> {
    const dto: DriverPrivateDto = {
      id: driver.id,
      displayName,
      cityId: driver.cityId,
      verificationStatus: driver.verificationStatus as DriverPrivateDto['verificationStatus'],
      hourlyRateMinor: driver.hourlyRateMinor,
      currency: 'INR',
      acceptingBookings: driver.acceptingBookings,
      version: driver.version,
      licenseNumber: driver.licenseCiphertext
        ? decryptIdentifier(key, licenseAad(driver.userId), driver.licenseCiphertext)
        : null,
      licenseCountry: driver.licenseCountry,
      licenseExpiresOn: driver.licenseExpiresOn ? isoDateOnly(driver.licenseExpiresOn) : null,
    };
    return dto;
  }

  type VehicleRow = {
    id: string;
    ownerId: string;
    registrationCiphertext: string;
    registrationDigest: string;
    make: string;
    model: string;
    year: number;
    category: string;
    seats: number;
    transmission: string;
    fuelType: string;
    cityId: string;
    description: string | null;
    verificationStatus: string;
    archivedAt: Date | null;
    version: number;
  };

  function toVehiclePrivate(vehicle: VehicleRow): VehiclePrivateDto {
    const dto: VehiclePrivateDto = {
      id: vehicle.id,
      ownerId: vehicle.ownerId,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category,
      seats: vehicle.seats,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      cityId: vehicle.cityId,
      verificationStatus: vehicle.verificationStatus as VehiclePrivateDto['verificationStatus'],
      version: vehicle.version,
      registrationNumber: decryptIdentifier(
        key,
        registrationAad(vehicle.registrationDigest),
        vehicle.registrationCiphertext,
      ),
    };
    if (vehicle.description !== null) dto.description = vehicle.description;
    if (vehicle.archivedAt) dto.archivedAt = vehicle.archivedAt.toISOString();
    return dto;
  }

  async function requireDriver(account: CurrentAccount): Promise<DriverRow> {
    const existing = await prisma.driverProfile.findUnique({ where: { userId: account.userId } });
    if (existing) return existing as DriverRow;
    const created = await prisma.driverProfile.create({
      data: { userId: account.userId },
    });
    return created as DriverRow;
  }

  async function ownVehicle(account: CurrentAccount, id: string): Promise<VehicleRow> {
    if (!z.uuid().safeParse(id).success) throw notFound('Vehicle not found');
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.ownerId !== account.userId) throw notFound('Vehicle not found');
    return vehicle as VehicleRow;
  }

  async function liveDriverHolds(driverId: string): Promise<boolean> {
    const row = await prisma.resourceReservation.findFirst({
      where: { driverId, releasedAt: null, endsAt: { gt: new Date() } },
      select: { id: true },
    });
    return row !== null;
  }
  async function liveVehicleHolds(vehicleId: string): Promise<boolean> {
    const row = await prisma.resourceReservation.findFirst({
      where: { vehicleId, releasedAt: null, endsAt: { gt: new Date() } },
      select: { id: true },
    });
    return row !== null;
  }

  async function storeAndScan(
    bytes: Buffer,
    declaredContentType: string,
  ): Promise<{
    objectKey: string;
    byteSize: number;
    sha256: string;
    contentType: string;
    scanStatus: 'PENDING' | 'CLEAN' | 'REJECTED';
  }> {
    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds 5 MiB');
    }
    let sanitized;
    try {
      sanitized = sanitizeEvidence(declaredContentType, bytes);
    } catch (error) {
      if (error instanceof EvidenceTypeError) {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', error.message);
      }
      throw error;
    }
    const stored = await storage.putQuarantined(
      toAsyncIterable(sanitized.bytes),
      sanitized.contentType,
    );
    // Scan outside any transaction/lock. `scanner` throws on transport failure:
    // the document stays PENDING (never usable) until a real CLEAN verdict.
    try {
      const verdict = await scanner.scan(
        await storage.scanRead(stored.objectKey),
        new AbortController().signal,
      );
      if (verdict === 'CLEAN') {
        await storage.promoteClean(stored.objectKey);
        return { ...stored, contentType: sanitized.contentType, scanStatus: 'CLEAN' };
      }
      await storage.retire(stored.objectKey);
      return { ...stored, contentType: sanitized.contentType, scanStatus: 'REJECTED' };
    } catch {
      return { ...stored, contentType: sanitized.contentType, scanStatus: 'PENDING' };
    }
  }

  return {
    async getMyDriver(account) {
      const driver = await requireDriver(account);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });
      return driverPrivate(driver, user.displayName);
    },

    async upsertDriver(account, input) {
      const parsed = DriverInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const data = parsed.data;
      if (parseDateOnly(data.licenseExpiresOn) < todayDate()) {
        // Reject an already-expired license.
        throw badRequest('License is expired');
      }
      const existing = await prisma.driverProfile.findUnique({
        where: { userId: account.userId },
      });
      const digest = identifierDigest('license', `${data.licenseCountry}:${data.licenseNumber}`);
      const ciphertext = encryptIdentifier(key, licenseAad(account.userId), data.licenseNumber);
      const material =
        !existing ||
        existing.licenseDigest !== digest ||
        existing.licenseCountry !== data.licenseCountry ||
        !existing.licenseExpiresOn ||
        isoDateOnly(existing.licenseExpiresOn) !== data.licenseExpiresOn;

      if (existing) {
        if ((data.version ?? 0) !== existing.version) {
          throw conflict('Driver profile was modified; reload and retry');
        }
        if (material && (await liveDriverHolds(existing.id))) {
          throw conflict('Material license changes are blocked by active commitments');
        }
      } else if (data.version !== undefined) {
        throw badRequest('New driver profiles must not send a version');
      }

      try {
        const saved = existing
          ? await prisma.driverProfile.update({
              where: { id: existing.id },
              data: {
                licenseCiphertext: ciphertext,
                licenseDigest: digest,
                licenseCountry: data.licenseCountry,
                licenseExpiresOn: parseDateOnly(data.licenseExpiresOn),
                cityId: data.serviceCityId,
                hourlyRateMinor: data.hourlyRateMinor,
                version: { increment: 1 },
                // Material license edits invalidate any prior approval.
                ...(material ? { verificationStatus: 'DRAFT', currentVerificationId: null } : {}),
              },
            })
          : await prisma.driverProfile.create({
              data: {
                userId: account.userId,
                licenseCiphertext: ciphertext,
                licenseDigest: digest,
                licenseCountry: data.licenseCountry,
                licenseExpiresOn: parseDateOnly(data.licenseExpiresOn),
                cityId: data.serviceCityId,
                hourlyRateMinor: data.hourlyRateMinor,
              },
            });
        const user = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });
        return driverPrivate(saved as DriverRow, user.displayName);
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('License is already registered');
        throw error;
      }
    },

    async setDriverListing(account, input) {
      const parsed = ListingInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const driver = await requireDriver(account);
      if (parsed.data.version !== driver.version) {
        throw conflict('Driver profile was modified; reload and retry');
      }
      if (parsed.data.enabled) {
        const approved = driver.verificationStatus === 'APPROVED';
        const unexpired =
          driver.licenseExpiresOn !== null && driver.licenseExpiresOn >= todayDate();
        if (!approved || !unexpired) {
          throw conflict('Driver approval and an unexpired license are required to list');
        }
      }
      const saved = await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { acceptingBookings: parsed.data.enabled, version: { increment: 1 } },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });
      return driverPrivate(saved as DriverRow, user.displayName);
    },

    async listDriverDocuments(account, query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const driver = await requireDriver(account);
      const where = { driverId: driver.id, retiredAt: null };
      const [total, rows] = await Promise.all([
        prisma.document.count({ where }),
        prisma.document.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data: rows.map(toDocumentDto), meta };
    },

    async uploadDriverDocument(account, input) {
      if (input.kind !== 'LICENSE')
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only license documents are allowed');
      const driver = await requireDriver(account);
      const stored = await storeAndScan(input.bytes, input.declaredContentType);
      const document = await prisma.document.create({
        data: {
          uploaderId: account.userId,
          driverId: driver.id,
          kind: 'LICENSE',
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          scanStatus: stored.scanStatus,
          expiresOn: input.expiresOn ? parseDateOnly(input.expiresOn) : null,
          retiredAt: stored.scanStatus === 'REJECTED' ? new Date() : null,
        },
      });
      if (stored.scanStatus === 'REJECTED') {
        throw new HttpError(
          422,
          'UNPROCESSABLE_ENTITY',
          'Uploaded file was rejected by the scanner',
        );
      }
      return toDocumentDto(document);
    },

    async submitDriverVerification(account, input) {
      const parsed = VersionInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const driver = await requireDriver(account);
      // CAS on the subject profile: a stale revision can never snapshot newer
      // qualification state than the client actually reviewed.
      if (parsed.data.version !== driver.version) {
        throw conflict('Driver profile was modified; reload and retry');
      }
      const license = await prisma.document.findFirst({
        where: { driverId: driver.id, kind: 'LICENSE', scanStatus: 'CLEAN', retiredAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!license) throw badRequest('A clean license document is required before submission');
      const unexpired =
        driver.licenseDigest !== null &&
        driver.licenseCountry !== null &&
        driver.licenseExpiresOn !== null &&
        driver.licenseExpiresOn >= todayDate() &&
        driver.cityId !== null &&
        driver.hourlyRateMinor !== null;
      if (!unexpired) throw badRequest('Complete and unexpired license details are required');
      const pending = await prisma.verificationRequest.findFirst({
        where: { driverId: driver.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) throw conflict('A driver verification is already pending');
      const last = await prisma.verificationRequest.findFirst({
        where: { driverId: driver.id },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      const revision = (last?.revision ?? 0) + 1;
      const request = await prisma.$transaction(async (tx) => {
        const created = await tx.verificationRequest.create({
          data: {
            driverId: driver.id,
            revision,
            subjectVersion: driver.version,
            status: 'PENDING',
            submittedBy: account.userId,
            submittedAt: new Date(),
          },
        });
        await tx.verificationDocument.create({
          data: { verificationId: created.id, documentId: license.id },
        });
        await tx.driverProfile.update({
          where: { id: driver.id },
          data: {
            verificationStatus: 'PENDING',
            currentVerificationId: created.id,
            version: { increment: 1 },
          },
        });
        return created;
      });
      return {
        id: request.id,
        subjectType: 'DRIVER',
        subjectId: driver.id,
        status: 'PENDING',
        version: request.version,
        documentIds: [license.id],
        submittedAt: request.submittedAt.toISOString(),
      };
    },

    async searchDrivers(query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const { cityId, startsAt, endsAt, maxHourlyRateMinor } = query;
      if ((startsAt === undefined) !== (endsAt === undefined)) {
        throw badRequest('startsAt and endsAt must be supplied together');
      }
      const cityFilter = cityId && z.uuid().safeParse(cityId).success ? cityId : undefined;
      const rateFilter =
        maxHourlyRateMinor && /^\d+$/.test(maxHourlyRateMinor)
          ? Number(maxHourlyRateMinor)
          : undefined;
      const baseWhere = {
        verificationStatus: 'APPROVED',
        acceptingBookings: true,
        licenseExpiresOn: { gte: todayDate() },
        ...(cityFilter ? { cityId: cityFilter } : {}),
        ...(rateFilter !== undefined && rateFilter <= 100_000_000
          ? { hourlyRateMinor: { lte: rateFilter } }
          : {}),
      };
      // DriverProfile has no relation to User, so suspended drivers are
      // excluded by intersecting the qualifying profiles with ACTIVE users.
      const candidates = await prisma.driverProfile.findMany({
        where: baseWhere,
        select: { userId: true },
      });
      const activeUsers = await prisma.user.findMany({
        where: { id: { in: candidates.map((row) => row.userId) }, status: 'ACTIVE' },
        select: { id: true },
      });
      const where = { ...baseWhere, userId: { in: activeUsers.map((row) => row.id) } };
      const [total, rows] = await Promise.all([
        prisma.driverProfile.count({ where }),
        prisma.driverProfile.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const pageUsers = await prisma.user.findMany({
        where: { id: { in: rows.map((row) => row.userId) } },
        select: { id: true, displayName: true },
      });
      const displayNames = new Map(pageUsers.map((row) => [row.id, row.displayName]));
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      const data: DriverDto[] = [];
      for (const row of rows) {
        if (startsAt && endsAt) {
          // Public hire needs a covering AVAILABLE window and no live hold.
          const start = new Date(startsAt);
          const end = new Date(endsAt);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            throw badRequest('Invalid time range');
          }
          const covered = await prisma.availabilityWindow.findFirst({
            where: {
              driverId: row.id,
              kind: 'AVAILABLE',
              removedAt: null,
              startsAt: { lte: start },
              endsAt: { gte: end },
            },
            select: { id: true },
          });
          if (!covered) continue;
          const blocked = await prisma.resourceReservation.findFirst({
            where: {
              driverId: row.id,
              releasedAt: null,
              startsAt: { lt: end },
              endsAt: { gt: start },
            },
            select: { id: true },
          });
          if (blocked) continue;
        }
        data.push({
          id: row.id,
          displayName: displayNames.get(row.userId) ?? '',
          cityId: row.cityId as string,
          verificationStatus: 'APPROVED',
          hourlyRateMinor: row.hourlyRateMinor as number,
          currency: 'INR',
          acceptingBookings: row.acceptingBookings,
          version: row.version,
        });
      }
      return { success: true, data, meta };
    },

    async getDriver(id) {
      if (!z.uuid().safeParse(id).success) throw notFound('Driver not found');
      const row = await prisma.driverProfile.findFirst({
        where: {
          id,
          verificationStatus: 'APPROVED',
          acceptingBookings: true,
          licenseExpiresOn: { gte: todayDate() },
        },
      });
      if (!row) throw notFound('Driver not found');
      const user = await prisma.user.findUnique({ where: { id: row.userId } });
      if (!user || user.status !== 'ACTIVE') throw notFound('Driver not found');
      return {
        id: row.id,
        displayName: user.displayName,
        cityId: row.cityId as string,
        verificationStatus: 'APPROVED',
        hourlyRateMinor: row.hourlyRateMinor as number,
        currency: 'INR',
        acceptingBookings: row.acceptingBookings,
        version: row.version,
      };
    },

    async createVehicle(account, input) {
      const parsed = VehicleInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const data = parsed.data;
      if (data.version !== undefined) throw badRequest('New vehicles must not send a version');
      const digest = identifierDigest('registration', data.registrationNumber);
      // The vehicle row id is DB-generated; bind the AEAD to the registration
      // digest so encryption never depends on insert ordering.
      const ciphertext = encryptIdentifier(key, registrationAad(digest), data.registrationNumber);
      try {
        const vehicle = await prisma.vehicle.create({
          data: {
            ownerId: account.userId,
            registrationCiphertext: ciphertext,
            registrationDigest: digest,
            make: data.make,
            model: data.model,
            year: data.year,
            category: data.category,
            seats: data.seats,
            transmission: data.transmission,
            fuelType: data.fuelType,
            cityId: data.cityId,
            description: data.description ?? null,
          },
        });
        return toVehiclePrivate(vehicle as VehicleRow);
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('Vehicle registration already exists');
        throw mapVehicleFk(error);
      }
    },

    async updateVehicle(account, id, input) {
      const vehicle = await ownVehicle(account, id);
      const parsed = VehicleInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const data = parsed.data;
      if (data.version !== vehicle.version) {
        throw conflict('Vehicle was modified; reload and retry');
      }
      const digest = identifierDigest('registration', data.registrationNumber);
      const material =
        digest !== vehicle.registrationDigest ||
        data.make !== vehicle.make ||
        data.model !== vehicle.model ||
        data.year !== vehicle.year ||
        data.category !== vehicle.category ||
        data.seats !== vehicle.seats ||
        data.transmission !== vehicle.transmission ||
        data.fuelType !== vehicle.fuelType ||
        data.cityId !== vehicle.cityId;
      if (material && (await liveVehicleHolds(vehicle.id))) {
        throw conflict('Material vehicle changes are blocked by active commitments');
      }
      try {
        const updates: Prisma.VehicleUncheckedUpdateInput = {
          registrationDigest: digest,
          make: data.make,
          model: data.model,
          year: data.year,
          category: data.category,
          seats: data.seats,
          transmission: data.transmission,
          fuelType: data.fuelType,
          cityId: data.cityId,
          description: data.description ?? null,
          version: { increment: 1 },
        };
        if (digest !== vehicle.registrationDigest) {
          updates.registrationCiphertext = encryptIdentifier(
            key,
            registrationAad(digest),
            data.registrationNumber,
          );
        }
        if (material) {
          // Material edits invalidate any prior approval.
          updates.verificationStatus = 'DRAFT';
          updates.currentVerificationId = null;
        }
        const saved = await prisma.vehicle.update({ where: { id: vehicle.id }, data: updates });
        return toVehiclePrivate(saved as VehicleRow);
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('Vehicle registration already exists');
        throw mapVehicleFk(error);
      }
    },

    async archiveVehicle(account, id) {
      const vehicle = await ownVehicle(account, id);
      const [booking, carpool] = await Promise.all([
        prisma.booking.findFirst({
          where: {
            vehicleId: vehicle.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
            endsAt: { gt: new Date() },
          },
          select: { id: true },
        }),
        prisma.carpool.findFirst({
          where: { vehicleId: vehicle.id, status: 'PUBLISHED', endsAt: { gt: new Date() } },
          select: { id: true },
        }),
      ]);
      if (booking || carpool) throw conflict('Vehicle has future commitments');
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });
      return { acknowledged: true };
    },

    async listMyVehicles(account, query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const where = { ownerId: account.userId, archivedAt: null };
      const [total, rows] = await Promise.all([
        prisma.vehicle.count({ where }),
        prisma.vehicle.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const data = rows.map((row) => toVehiclePrivate(row as VehicleRow));
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data, meta };
    },

    async listVehicleDocuments(account, vehicleId, query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const vehicle = await ownVehicle(account, vehicleId);
      const where = { vehicleId: vehicle.id, retiredAt: null };
      const [total, rows] = await Promise.all([
        prisma.document.count({ where }),
        prisma.document.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data: rows.map(toDocumentDto), meta };
    },

    async uploadVehicleDocument(account, vehicleId, input) {
      const vehicle = await ownVehicle(account, vehicleId);
      if (input.kind !== 'REGISTRATION' && input.kind !== 'INSURANCE') {
        throw new HttpError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Only registration or insurance documents are allowed',
        );
      }
      if (input.kind === 'INSURANCE' && !input.expiresOn) {
        throw badRequest('Insurance documents require an expiry date');
      }
      const stored = await storeAndScan(input.bytes, input.declaredContentType);
      const document = await prisma.document.create({
        data: {
          uploaderId: account.userId,
          vehicleId: vehicle.id,
          kind: input.kind,
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          scanStatus: stored.scanStatus,
          expiresOn: input.expiresOn ? parseDateOnly(input.expiresOn) : null,
          retiredAt: stored.scanStatus === 'REJECTED' ? new Date() : null,
        },
      });
      if (stored.scanStatus === 'REJECTED') {
        throw new HttpError(
          422,
          'UNPROCESSABLE_ENTITY',
          'Uploaded file was rejected by the scanner',
        );
      }
      return toDocumentDto(document);
    },

    async submitVehicleVerification(account, vehicleId, input) {
      const parsed = VersionInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const vehicle = await ownVehicle(account, vehicleId);
      if (parsed.data.version !== vehicle.version) {
        throw conflict('Vehicle was modified; reload and retry');
      }
      const [registration, insurance] = await Promise.all([
        prisma.document.findFirst({
          where: {
            vehicleId: vehicle.id,
            kind: 'REGISTRATION',
            scanStatus: 'CLEAN',
            retiredAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.document.findFirst({
          where: { vehicleId: vehicle.id, kind: 'INSURANCE', scanStatus: 'CLEAN', retiredAt: null },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      if (!registration) throw badRequest('A clean registration document is required');
      if (!insurance) throw badRequest('A clean insurance document is required');
      if (insurance.expiresOn && insurance.expiresOn < todayDate()) {
        throw badRequest('Insurance document is expired');
      }
      const pending = await prisma.verificationRequest.findFirst({
        where: { vehicleId: vehicle.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) throw conflict('A vehicle verification is already pending');
      const last = await prisma.verificationRequest.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      const revision = (last?.revision ?? 0) + 1;
      const request = await prisma.$transaction(async (tx) => {
        const created = await tx.verificationRequest.create({
          data: {
            vehicleId: vehicle.id,
            revision,
            subjectVersion: vehicle.version,
            status: 'PENDING',
            submittedBy: account.userId,
            submittedAt: new Date(),
          },
        });
        for (const documentId of [registration.id, insurance.id]) {
          await tx.verificationDocument.create({
            data: { verificationId: created.id, documentId },
          });
        }
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: {
            verificationStatus: 'PENDING',
            currentVerificationId: created.id,
            version: { increment: 1 },
          },
        });
        return created;
      });
      return {
        id: request.id,
        subjectType: 'VEHICLE',
        subjectId: vehicle.id,
        status: 'PENDING',
        version: request.version,
        documentIds: [registration.id, insurance.id],
        submittedAt: request.submittedAt.toISOString(),
      };
    },

    async getDocumentContent(account, id) {
      if (!z.uuid().safeParse(id).success) throw notFound('Document not found');
      const document = await prisma.document.findUnique({
        where: { id },
        include: { vehicle: { select: { ownerId: true } }, driver: { select: { userId: true } } },
      });
      if (!document || document.retiredAt) throw notFound('Document not found');
      const ownerId = document.vehicle?.ownerId ?? document.driver?.userId ?? document.uploaderId;
      const isAdmin = account?.roles.includes('ADMIN') ?? false;
      // Private evidence: only the owning account or an administrator, and
      // never a quarantined/unscanned object.
      if (!account || (account.userId !== ownerId && !isAdmin))
        throw notFound('Document not found');
      if (document.scanStatus !== 'CLEAN') throw notFound('Document not found');
      const source = await storage.authorizedRead(document.objectKey);
      return {
        stream: Readable.from(source),
        contentType: document.contentType,
        filename: `${document.kind.toLowerCase()}-${document.id}`,
      };
    },

    async retireDocument(account, id) {
      if (!z.uuid().safeParse(id).success) throw notFound('Document not found');
      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          links: { include: { verification: { select: { status: true } } } },
        },
      });
      if (!document || document.retiredAt || document.uploaderId !== account.userId) {
        throw notFound('Document not found');
      }
      const inLiveRevision = document.links.some((link) =>
        ['PENDING', 'APPROVED'].includes(link.verification.status),
      );
      if (inLiveRevision) throw conflict('Document is part of a live verification revision');
      await prisma.document.update({ where: { id: document.id }, data: { retiredAt: new Date() } });
      await storage.retire(document.objectKey);
      return { acknowledged: true };
    },

    async scanPendingDocuments(signal) {
      const pending = await prisma.document.findMany({
        where: { scanStatus: 'PENDING', retiredAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const document of pending) {
        if (signal.aborted) return;
        try {
          const verdict = await scanner.scan(await storage.scanRead(document.objectKey), signal);
          if (verdict === 'CLEAN') {
            await storage.promoteClean(document.objectKey);
            await prisma.document.update({
              where: { id: document.id },
              data: { scanStatus: 'CLEAN' },
            });
          } else {
            await storage.retire(document.objectKey);
            await prisma.document.update({
              where: { id: document.id },
              data: { scanStatus: 'REJECTED', retiredAt: new Date() },
            });
          }
        } catch {
          // Leave PENDING for a later retry; never a false CLEAN.
        }
      }
    },

    async cleanupOrphanUploads() {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const stale = await prisma.document.findMany({
        where: { scanStatus: 'PENDING', retiredAt: null, createdAt: { lt: cutoff } },
        take: 100,
      });
      for (const document of stale) {
        await storage.removeOrphan(document.objectKey);
        await prisma.document.update({
          where: { id: document.id },
          data: { retiredAt: new Date() },
        });
      }
    },

    async expireQualifications() {
      const today = todayDate();
      await prisma.driverProfile.updateMany({
        where: { verificationStatus: 'APPROVED', licenseExpiresOn: { lt: today } },
        data: { verificationStatus: 'EXPIRED', acceptingBookings: false },
      });
      const expiredInsurance = await prisma.document.findMany({
        where: {
          kind: 'INSURANCE',
          scanStatus: 'CLEAN',
          expiresOn: { lt: today },
          vehicleId: { not: null },
        },
        select: { vehicleId: true },
      });
      const vehicleIds = [...new Set(expiredInsurance.map((row) => row.vehicleId as string))];
      if (vehicleIds.length > 0) {
        await prisma.vehicle.updateMany({
          where: { id: { in: vehicleIds }, verificationStatus: 'APPROVED' },
          data: { verificationStatus: 'EXPIRED' },
        });
      }
    },
  };
}

function mapVehicleFk(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2003'
  ) {
    return badRequest('Unknown city');
  }
  return error;
}

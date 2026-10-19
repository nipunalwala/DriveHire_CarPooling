import { z } from 'zod';
import {
  BookingStatusSchema,
  type BookingDto,
  type Page,
  type PageMeta,
} from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { toBookingDto, type BookingWithRelations } from './mappers.js';

// Participant-facing booking reads. List scope is the authenticated passenger's
// own passenger_id (never a driver profile id); detail access is granted to the
// passenger, the assigned driver (booking.driver_id is a driver_profiles id, so
// the user lookup goes through driver_profiles.user_id), the owning vehicle
// owner and administrators. Foreign objects are indistinguishable from missing
// ones and return 404. All responses are safe hand-mapped DTOs, never rows.

const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().min(1).max(30).optional(),
});

// The driver list contract only exposes page/pageSize. Unknown query keys such
// as a forged driverId are stripped, never trusted for scoping.
const DriverPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const BOOKING_RELATIONS = { decisions: true, trips: true } as const;

export interface BookingsReadService {
  listBookings(account: CurrentAccount, query: Record<string, unknown>): Promise<Page<BookingDto>>;
  listDriverBookings(
    account: CurrentAccount,
    query: Record<string, unknown>,
  ): Promise<Page<BookingDto>>;
  getBooking(account: CurrentAccount, id: string): Promise<BookingDto>;
}

export function createBookingsReadService({
  prisma,
}: {
  prisma: PrismaClient;
}): BookingsReadService {
  return {
    async listBookings(account, query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const { page, pageSize } = parsed.data;
      const status = parsed.data.status;
      const parsedStatus = status === undefined ? null : BookingStatusSchema.safeParse(status);
      if (parsedStatus && !parsedStatus.success) throw badRequest('Request validation failed');

      const where = {
        passengerId: account.userId,
        ...(parsedStatus?.success ? { status: parsedStatus.data } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
          where,
          include: BOOKING_RELATIONS,
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const meta: PageMeta = { page, pageSize, total };
      return {
        success: true,
        data: rows.map((row) => toBookingDto(row as BookingWithRelations)),
        meta,
      };
    },

    async listDriverBookings(account, query) {
      if (!account.roles.includes('DRIVER')) throw forbidden('Driver role is required');
      const parsed = DriverPageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const { page, pageSize } = parsed.data;

      // booking.driver_id is a driver_profiles id, so the authenticated user is
      // resolved through driver_profiles.user_id before scoping the query.
      const profile = await prisma.driverProfile.findUnique({
        where: { userId: account.userId },
        select: { id: true },
      });
      if (!profile) throw forbidden('Driver profile is not eligible');

      const where = { driverId: profile.id };
      const [total, rows] = await Promise.all([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
          where,
          include: BOOKING_RELATIONS,
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const meta: PageMeta = { page, pageSize, total };
      return {
        success: true,
        data: rows.map((row) => toBookingDto(row as BookingWithRelations)),
        meta,
      };
    },

    async getBooking(account, id) {
      if (!z.uuid().safeParse(id).success) throw notFound('Booking not found');
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: BOOKING_RELATIONS,
      });
      if (!booking) throw notFound('Booking not found');

      const [driver, vehicle] = await Promise.all([
        prisma.driverProfile.findUnique({
          where: { id: booking.driverId },
          select: { userId: true },
        }),
        prisma.vehicle.findUnique({
          where: { id: booking.vehicleId },
          select: { ownerId: true },
        }),
      ]);
      const isAdmin = account.roles.includes('ADMIN');
      const isPassenger = booking.passengerId === account.userId;
      const isDriver = driver?.userId === account.userId;
      const isOwner = vehicle?.ownerId === account.userId;
      if (!isAdmin && !isPassenger && !isDriver && !isOwner) {
        throw notFound('Booking not found');
      }
      return toBookingDto(booking as BookingWithRelations);
    },
  };
}

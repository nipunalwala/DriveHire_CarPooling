import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import {
  ReasonInputSchema,
  VerificationDecisionInputSchema,
  type AuditEntryDto,
  type Page,
  type PageMeta,
  type UserDto,
  type VerificationDto,
} from '@drivehire/contracts';
import type { Prisma, PrismaClient } from '../../generated/client/client.js';
import { badRequest, conflict, forbidden, notFound, unauthenticated } from '../../errors.js';
import type { AccountRequest, CurrentAccount, Role } from '../accounts/service.js';
import { toUserDto } from '../accounts/service.js';

// Minimal administrator surface: user listing/support read, suspension and
// reactivation, the verification review queue and the immutable audit log.
// Every sensitive read and every mutation appends a safe audit row inside its
// transaction; the runtime role cannot update or delete audit rows.

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const UserQuerySchema = PageQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  role: z.enum(['PASSENGER', 'DRIVER', 'ADMIN']).optional(),
});
const VerificationQuerySchema = PageQuerySchema.extend({
  type: z.enum(['DRIVER', 'VEHICLE']).optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
});
const AuditQuerySchema = PageQuerySchema.extend({
  actorId: z.uuid().optional(),
  action: z.string().min(1).max(100).optional(),
  from: z.iso.datetime({ offset: true }).or(z.iso.datetime()).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.datetime()).optional(),
});

export interface AuditInput {
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  requestId: string;
  reason?: string;
  beforeSafe?: Prisma.InputJsonValue;
  afterSafe?: Prisma.InputJsonValue;
}

/** Append one immutable administrator audit row (never exposed fields/secrets). */
export async function appendAudit(
  client: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      actorType: 'USER',
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason ?? null,
      requestId: input.requestId,
      ...(input.beforeSafe !== undefined ? { beforeSafe: input.beforeSafe } : {}),
      ...(input.afterSafe !== undefined ? { afterSafe: input.afterSafe } : {}),
    },
  });
}

/**
 * Assumes `requireAccount` already populated `req.account`; ADMIN role is a
 * current server-side check, not a token claim.
 */
export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const account = (req as AccountRequest).account;
  if (!account) return next(unauthenticated('Authentication required'));
  if (!account.roles.includes('ADMIN')) return next(forbidden('Administrator role is required'));
  next();
};

export interface RequestContext {
  requestId: string;
}

export interface AdminService {
  listUsers(account: CurrentAccount, query: Record<string, string>): Promise<Page<UserDto>>;
  getUser(account: CurrentAccount, id: string, ctx: RequestContext): Promise<UserDto>;
  suspendUser(
    account: CurrentAccount,
    id: string,
    input: unknown,
    ctx: RequestContext,
  ): Promise<UserDto>;
  reactivateUser(
    account: CurrentAccount,
    id: string,
    input: unknown,
    ctx: RequestContext,
  ): Promise<UserDto>;
  listVerifications(
    account: CurrentAccount,
    query: Record<string, string>,
  ): Promise<Page<VerificationDto>>;
  getVerification(
    account: CurrentAccount,
    id: string,
    ctx: RequestContext,
  ): Promise<VerificationDto>;
  decideVerification(
    account: CurrentAccount,
    id: string,
    input: unknown,
    ctx: RequestContext,
  ): Promise<VerificationDto>;
  listAuditLogs(
    account: CurrentAccount,
    query: Record<string, string>,
  ): Promise<Page<AuditEntryDto>>;
}

type UserWithRoles = {
  id: string;
  displayName: string;
  email: string;
  emailVerifiedAt: Date | null;
  phone: string | null;
  status: string;
  tokenVersion: number;
  createdAt: Date;
  roles: { role: string }[];
};

function toAdminUser(row: UserWithRoles): UserDto {
  const roles = [...new Set(row.roles.map((entry) => entry.role as Role))].sort();
  return toUserDto(row, roles);
}

type VerificationWithLinks = {
  id: string;
  driverId: string | null;
  vehicleId: string | null;
  status: string;
  version: number;
  reason: string | null;
  submittedAt: Date;
  links: { documentId: string }[];
};

function toVerificationDto(row: VerificationWithLinks, documentIds: string[]): VerificationDto {
  const dto: VerificationDto = {
    id: row.id,
    subjectType: row.driverId ? 'DRIVER' : 'VEHICLE',
    subjectId: (row.driverId ?? row.vehicleId) as string,
    status: row.status as VerificationDto['status'],
    version: row.version,
    documentIds,
    submittedAt: row.submittedAt.toISOString(),
  };
  if (row.reason) dto.reason = row.reason;
  return dto;
}

function todayDate(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

// Serializes administrator suspension decisions so the last-active-admin guard
// is evaluated against a stable admin set.
const ADMIN_SUSPENSION_LOCK_KEY = 48_243_501;

export function createAdminService({ prisma }: { prisma: PrismaClient }): AdminService {
  return {
    async listUsers(account, query) {
      void account;
      const parsed = UserQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const where: Prisma.UserWhereInput = {};
      if (parsed.data.status) where.status = parsed.data.status;
      if (parsed.data.role) where.roles = { some: { role: parsed.data.role } };
      if (parsed.data.search) {
        where.OR = [
          { email: { contains: parsed.data.search, mode: 'insensitive' } },
          { displayName: { contains: parsed.data.search, mode: 'insensitive' } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: { roles: { select: { role: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data: rows.map(toAdminUser), meta };
    },

    async getUser(account, id, ctx) {
      void account;
      if (!z.uuid().safeParse(id).success) throw notFound('User not found');
      const row = await prisma.user.findUnique({
        where: { id },
        include: { roles: { select: { role: true } } },
      });
      if (!row) throw notFound('User not found');
      // A sensitive support read is audited with safe metadata only.
      await prisma.$transaction((tx) =>
        appendAudit(tx, {
          actorId: account.userId,
          action: 'ADMIN_USER_READ',
          subjectType: 'user',
          subjectId: id,
          requestId: ctx.requestId,
        }),
      );
      return toAdminUser(row);
    },

    async suspendUser(account, id, input, ctx) {
      const parsed = ReasonInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      if (!z.uuid().safeParse(id).success) throw notFound('User not found');
      const now = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        // One serializing lock per admin suspension: concurrent mutual
        // suspensions cannot both observe two active admins and both commit.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADMIN_SUSPENSION_LOCK_KEY}::bigint)::text AS lock`;
        // Re-validate the caller from current committed state; a concurrent
        // suspension may have removed the caller's active administrator access.
        const caller = await tx.user.findUnique({
          where: { id: account.userId },
          include: { roles: { select: { role: true } } },
        });
        if (
          !caller ||
          caller.status !== 'ACTIVE' ||
          !caller.roles.some((role) => role.role === 'ADMIN')
        ) {
          throw forbidden('Administrator access is no longer active');
        }
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        const target = await tx.user.findUnique({
          where: { id },
          include: { roles: { select: { role: true } } },
        });
        if (!target) throw notFound('User not found');
        if (target.status === 'SUSPENDED') throw conflict('Account is already suspended');
        const isAdmin = target.roles.some((role) => role.role === 'ADMIN');
        // The last active administrator (including the caller) must remain; the
        // count is now inside the serialized transaction.
        if (isAdmin) {
          const activeAdmins = await tx.user.count({
            where: { status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
          });
          if (activeAdmins <= 1) {
            throw conflict('The last active administrator cannot be suspended');
          }
        }
        if (target.id === account.userId) {
          throw conflict('Administrators cannot suspend themselves');
        }
        const user = await tx.user.update({
          where: { id },
          data: {
            status: 'SUSPENDED',
            suspendedAt: now,
            suspensionReason: parsed.data.reason,
            version: { increment: 1 },
            // Immediately invalidates every issued access/refresh credential.
            tokenVersion: { increment: 1 },
          },
          include: { roles: { select: { role: true } } },
        });
        await tx.refreshToken.updateMany({
          where: { session: { userId: id }, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.refreshToken.updateMany({
          where: { session: { userId: id }, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'SUSPENDED' },
        });
        // Resolve the currently supported provider rows. Booking/carpool/trip
        // resolution is extended when those services arrive (see ledger).
        await tx.driverProfile.updateMany({
          where: { userId: id },
          data: { acceptingBookings: false },
        });
        await appendAudit(tx, {
          actorId: account.userId,
          action: 'ADMIN_USER_SUSPEND',
          subjectType: 'user',
          subjectId: id,
          reason: parsed.data.reason,
          requestId: ctx.requestId,
        });
        return user;
      });
      return toAdminUser(updated);
    },

    async reactivateUser(account, id, input, ctx) {
      const parsed = ReasonInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      if (!z.uuid().safeParse(id).success) throw notFound('User not found');
      const target = await prisma.user.findUnique({ where: { id }, select: { status: true } });
      if (!target) throw notFound('User not found');
      if (target.status !== 'SUSPENDED') throw conflict('Account is not suspended');
      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            suspendedAt: null,
            suspensionReason: null,
            version: { increment: 1 },
          },
          include: { roles: { select: { role: true } } },
        });
        // No sessions or approvals are restored; the user signs in again.
        await appendAudit(tx, {
          actorId: account.userId,
          action: 'ADMIN_USER_REACTIVATE',
          subjectType: 'user',
          subjectId: id,
          reason: parsed.data.reason,
          requestId: ctx.requestId,
        });
        return user;
      });
      return toAdminUser(updated);
    },

    async listVerifications(account, query) {
      void account;
      const parsed = VerificationQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const where: Prisma.VerificationRequestWhereInput = {
        status: parsed.data.status ?? 'PENDING',
      };
      if (parsed.data.type === 'DRIVER') where.driverId = { not: null };
      if (parsed.data.type === 'VEHICLE') where.vehicleId = { not: null };
      const [total, rows] = await Promise.all([
        prisma.verificationRequest.count({ where }),
        prisma.verificationRequest.findMany({
          where,
          include: { links: { select: { documentId: true } } },
          orderBy: { submittedAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return {
        success: true,
        data: rows.map((row) =>
          toVerificationDto(
            row,
            row.links.map((link) => link.documentId),
          ),
        ),
        meta,
      };
    },

    async getVerification(account, id, ctx) {
      if (!z.uuid().safeParse(id).success) throw notFound('Verification not found');
      const row = await prisma.verificationRequest.findUnique({
        where: { id },
        include: { links: { select: { documentId: true } } },
      });
      if (!row) throw notFound('Verification not found');
      await prisma.$transaction((tx) =>
        appendAudit(tx, {
          actorId: account.userId,
          action: 'ADMIN_VERIFICATION_READ',
          subjectType: 'verification',
          subjectId: id,
          requestId: ctx.requestId,
        }),
      );
      return toVerificationDto(
        row,
        row.links.map((link) => link.documentId),
      );
    },

    async decideVerification(account, id, input, ctx) {
      const parsed = VerificationDecisionInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      if (!z.uuid().safeParse(id).success) throw notFound('Verification not found');
      const request = await prisma.verificationRequest.findUnique({
        where: { id },
        include: { links: { select: { documentId: true } } },
      });
      if (!request) throw notFound('Verification not found');
      // No own-submission approval, even for an uppercase ADMIN.
      if (request.submittedBy === account.userId) {
        throw forbidden('You cannot decide your own submission');
      }
      if (request.status !== 'PENDING') throw conflict('Verification has already been decided');
      // CAS on the reviewed revision: a stale decision never touches newer state.
      if (parsed.data.version !== request.version) {
        throw conflict('Verification was modified; reload and retry');
      }
      const documentIds = request.links.map((link) => link.documentId);
      const approve = parsed.data.decision === 'APPROVE';
      const now = new Date();
      const decided = await prisma.$transaction(async (tx) => {
        const updated = await tx.verificationRequest.updateMany({
          where: { id: request.id, status: 'PENDING', version: parsed.data.version },
          data: {
            status: approve ? 'APPROVED' : 'REJECTED',
            decidedBy: account.userId,
            decidedAt: now,
            reason: parsed.data.reason,
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) throw conflict('Verification was modified; reload and retry');
        if (approve) {
          const documents = await tx.document.findMany({ where: { id: { in: documentIds } } });
          const clean =
            documentIds.length > 0 &&
            documents.length === documentIds.length &&
            documents.every((row) => row.scanStatus === 'CLEAN' && row.retiredAt === null);
          if (!clean) throw badRequest('All submitted documents must be clean and current');
          if (request.driverId) {
            const driver = await tx.driverProfile.findUnique({ where: { id: request.driverId } });
            if (!driver) throw notFound('Verification subject not found');
            if (!driver.licenseExpiresOn || driver.licenseExpiresOn < todayDate()) {
              throw badRequest('License is expired');
            }
            // Re-check currentVerificationId inside the transaction: a material
            // edit committing mid-decision clears it and must not be overwritten
            // by an approval of now-invalidated evidence.
            const outcome = await tx.driverProfile.updateMany({
              where: { id: driver.id, currentVerificationId: request.id },
              data: { verificationStatus: 'APPROVED', version: { increment: 1 } },
            });
            if (outcome.count === 0) throw conflict('Subject changed since submission; reload');
          } else if (request.vehicleId) {
            const vehicle = await tx.vehicle.findUnique({ where: { id: request.vehicleId } });
            if (!vehicle) throw notFound('Verification subject not found');
            // Re-check the submitted insurance expiry independently of the
            // expiry worker, which may be stopped.
            const insurance = documents.find((row) => row.kind === 'INSURANCE');
            if (!insurance || !insurance.expiresOn || insurance.expiresOn < todayDate()) {
              throw badRequest('Insurance document is expired');
            }
            const outcome = await tx.vehicle.updateMany({
              where: { id: vehicle.id, currentVerificationId: request.id },
              data: { verificationStatus: 'APPROVED', version: { increment: 1 } },
            });
            if (outcome.count === 0) throw conflict('Subject changed since submission; reload');
          }
        } else if (request.driverId) {
          const outcome = await tx.driverProfile.updateMany({
            where: { id: request.driverId, currentVerificationId: request.id },
            data: { verificationStatus: 'REJECTED', version: { increment: 1 } },
          });
          if (outcome.count === 0) throw conflict('Subject changed since submission; reload');
        } else if (request.vehicleId) {
          const outcome = await tx.vehicle.updateMany({
            where: { id: request.vehicleId, currentVerificationId: request.id },
            data: { verificationStatus: 'REJECTED', version: { increment: 1 } },
          });
          if (outcome.count === 0) throw conflict('Subject changed since submission; reload');
        }
        await appendAudit(tx, {
          actorId: account.userId,
          action: approve ? 'ADMIN_VERIFICATION_APPROVE' : 'ADMIN_VERIFICATION_REJECT',
          subjectType: 'verification',
          subjectId: request.id,
          reason: parsed.data.reason,
          requestId: ctx.requestId,
        });
        return tx.verificationRequest.findUniqueOrThrow({
          where: { id: request.id },
          include: { links: { select: { documentId: true } } },
        });
      });
      return toVerificationDto(
        decided,
        decided.links.map((link) => link.documentId),
      );
    },

    async listAuditLogs(account, query) {
      void account;
      const parsed = AuditQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const where: Prisma.AuditLogWhereInput = {};
      if (parsed.data.actorId) where.actorId = parsed.data.actorId;
      if (parsed.data.action) where.action = parsed.data.action;
      const createdAt: Prisma.DateTimeFilter = {};
      if (parsed.data.from) createdAt.gte = new Date(parsed.data.from);
      if (parsed.data.to) createdAt.lte = new Date(parsed.data.to);
      if (parsed.data.from || parsed.data.to) where.createdAt = createdAt;
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      const data: AuditEntryDto[] = rows.map((row) => {
        const entry: AuditEntryDto = {
          id: row.id,
          actorId: row.actorId,
          action: row.action,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          requestId: row.requestId,
          createdAt: row.createdAt.toISOString(),
        };
        if (row.reason) entry.reason = row.reason;
        return entry;
      });
      return { success: true, data, meta };
    },
  };
}

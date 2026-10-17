import { ProfileInputSchema, type UserDto } from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { rolesOf, toUserDto, type CurrentAccount } from './service.js';

// Own-profile and driver-capability operations. Every target is derived from the
// authenticated account, so there is no cross-account profile surface and a
// different user id is simply not addressable.
export interface ProfileService {
  getProfile(account: CurrentAccount): Promise<UserDto>;
  updateProfile(account: CurrentAccount, input: unknown): Promise<UserDto>;
  enableDriver(account: CurrentAccount): Promise<UserDto>;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export function createProfileService({ prisma }: { prisma: PrismaClient }): ProfileService {
  return {
    async getProfile(account) {
      const user = await prisma.user.findUnique({ where: { id: account.userId } });
      if (!user || user.status !== 'ACTIVE') throw notFound('Profile not found');
      return toUserDto(user, await rolesOf(prisma, account.userId));
    },

    async updateProfile(account, input) {
      const parsed = ProfileInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const user = await prisma.user.findUnique({ where: { id: account.userId } });
      if (!user) throw notFound('Profile not found');
      try {
        const updated = await prisma.user.update({
          where: { id: account.userId },
          data: {
            ...(parsed.data.displayName !== undefined
              ? { displayName: parsed.data.displayName }
              : {}),
            ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
          },
        });
        return toUserDto(updated, await rolesOf(prisma, account.userId));
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('Phone number already in use');
        throw error;
      }
    },

    async enableDriver(account) {
      const user = await prisma.user.findUnique({ where: { id: account.userId } });
      if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt === null) {
        throw forbidden('Verified active accounts may enable driver onboarding');
      }
      try {
        // Only DRIVER is self-grantable; ADMIN is operator-granted and OWNER is
        // retired, so neither can be created through this route.
        await prisma.userRole.create({ data: { userId: account.userId, role: 'DRIVER' } });
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('Driver role is already enabled');
        throw error;
      }
      return toUserDto(user, await rolesOf(prisma, account.userId));
    },
  };
}

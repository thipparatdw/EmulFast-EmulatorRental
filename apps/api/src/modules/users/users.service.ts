import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  UserProfileResponse,
  UpdateProfileInput,
  ChangePasswordInput,
  UserResponse,
} from "@emulfast/shared";

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,
};

// Points thresholds per tier
const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 15000,
} as const;

type TierCode = keyof typeof TIER_THRESHOLDS;

function nextTierInfo(points: number): {
  nextTierCode: TierCode | null;
  pointsToNextTier: number | null;
} {
  if (points < TIER_THRESHOLDS.silver) {
    return { nextTierCode: "silver", pointsToNextTier: TIER_THRESHOLDS.silver - points };
  }
  if (points < TIER_THRESHOLDS.gold) {
    return { nextTierCode: "gold", pointsToNextTier: TIER_THRESHOLDS.gold - points };
  }
  if (points < TIER_THRESHOLDS.platinum) {
    return { nextTierCode: "platinum", pointsToNextTier: TIER_THRESHOLDS.platinum - points };
  }
  return { nextTierCode: null, pointsToNextTier: null };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /users/me ────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membershipTier: true,
        wallet: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "User not found",
          messageKey: "errors.user.not_found",
        },
      });
    }

    const { nextTierCode, pointsToNextTier } = nextTierInfo(user.membershipPoints);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role as UserProfileResponse["role"],
      status: user.status as UserProfileResponse["status"],
      locale: user.locale as UserProfileResponse["locale"],
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      membershipTierCode:
        (user.membershipTier?.code as UserProfileResponse["membershipTierCode"]) ?? null,
      membershipPoints: user.membershipPoints,
      createdAt: user.createdAt.toISOString(),
      membership: {
        tierCode:
          (user.membershipTier?.code as UserProfileResponse["membershipTierCode"]) ?? null,
        points: user.membershipPoints,
        nextTierCode,
        pointsToNextTier,
      },
      wallet: user.wallet
        ? {
            balance: user.wallet.balance.toString(),
            walletId: user.wallet.id,
          }
        : null,
    };
  }

  // ─── PATCH /users/me ──────────────────────────────────────────────────────

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { membershipTier: true },
    });

    if (!user) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "User not found",
          messageKey: "errors.user.not_found",
        },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName;
    }
    if (input.phone !== undefined) {
      updateData.phone = input.phone;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { membershipTier: true },
    });

    this.logger.log(`User profile updated: ${userId}`);

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      phone: updated.phone ?? null,
      avatarUrl: updated.avatarUrl ?? null,
      role: updated.role as UserResponse["role"],
      status: updated.status as UserResponse["status"],
      locale: updated.locale as UserResponse["locale"],
      emailVerifiedAt: updated.emailVerifiedAt?.toISOString() ?? null,
      membershipTierCode:
        (updated.membershipTier?.code as UserResponse["membershipTierCode"]) ?? null,
      membershipPoints: updated.membershipPoints,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  // ─── POST /users/me/password ──────────────────────────────────────────────

  async changePassword(userId: string, input: ChangePasswordInput): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "User not found",
          messageKey: "errors.user.not_found",
        },
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.oldPassword);
    if (!passwordValid) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
          messageKey: "errors.user.wrong_password",
        },
      });
    }

    if (input.oldPassword === input.newPassword) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "New password must differ from current password",
          messageKey: "errors.user.password_same",
        },
      });
    }

    const newHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    this.logger.log(`User password changed: ${userId}`);

    return { ok: true };
  }
}

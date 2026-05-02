import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { RegisterInput, LoginInput, UserResponse } from "@emulfast/shared";
import type { JwtPayload } from "./decorators/current-user.decorator.js";
import { User } from "@emulfast/db";

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,
};

// 15 minutes in seconds
const ACCESS_TOKEN_EXPIRES_IN = 15 * 60;
// 7 days in seconds
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<{
    user: UserResponse;
    accessToken: string;
    accessTokenExpiresAt: string;
  }> {
    // ตรวจว่า email ซ้ำหรือไม่
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        error: {
          code: "CONFLICT",
          message: "Email already registered",
          messageKey: "errors.auth.email_taken",
        },
      });
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    // สร้าง User + Wallet ในครั้งเดียว (transaction)
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          phone: input.phone ?? null,
          locale: input.locale ?? "th",
          role: "user",
          status: "active",
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: "0",
          lockedBalance: "0",
        },
      });

      return newUser;
    });

    this.logger.log(`New user registered: ${user.email} (${user.id})`);

    const { accessToken, accessTokenExpiresAt } = this.issueAccessToken(user);

    return {
      user: this.toUserResponse(user),
      accessToken,
      accessTokenExpiresAt,
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(input: LoginInput): Promise<{
    user: UserResponse;
    accessToken: string;
    accessTokenExpiresAt: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
          messageKey: "errors.auth.invalid_credentials",
        },
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
          messageKey: "errors.auth.invalid_credentials",
        },
      });
    }

    if (user.status !== "active") {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Account is not active",
          messageKey: "errors.auth.account_inactive",
        },
      });
    }

    // อัปเดต lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in: ${user.email} (${user.id})`);

    const { accessToken, accessTokenExpiresAt } = this.issueAccessToken(user);

    return {
      user: this.toUserResponse(user),
      accessToken,
      accessTokenExpiresAt,
    };
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  async refreshToken(userId: string): Promise<{
    accessToken: string;
    accessTokenExpiresAt: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user || user.status !== "active") {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid refresh token",
          messageKey: "errors.unauthorized",
        },
      });
    }

    const { accessToken, accessTokenExpiresAt } = this.issueAccessToken(user as User);
    return { accessToken, accessTokenExpiresAt };
  }

  // ─── Get Me ──────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { membershipTier: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "User not found",
          messageKey: "errors.unauthorized",
        },
      });
    }

    return this.toUserResponse(user);
  }

  // ─── Issue Refresh Token ──────────────────────────────────────────────────────

  issueRefreshToken(user: Pick<User, "id" | "email" | "role">): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const secret = this.configService.get<string>("JWT_REFRESH_SECRET");
    return this.jwtService.sign(payload, {
      secret,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private issueAccessToken(user: Pick<User, "id" | "email" | "role">): {
    accessToken: string;
    accessTokenExpiresAt: string;
  } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const accessTokenExpiresAt = new Date(
      Date.now() + ACCESS_TOKEN_EXPIRES_IN * 1000,
    ).toISOString();

    return { accessToken, accessTokenExpiresAt };
  }

  private toUserResponse(
    user: User & { membershipTier?: { code: string } | null },
  ): UserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role as UserResponse["role"],
      status: user.status as UserResponse["status"],
      locale: user.locale as UserResponse["locale"],
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      membershipTierCode:
        (user.membershipTier?.code as UserResponse["membershipTierCode"]) ?? null,
      membershipPoints: user.membershipPoints,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

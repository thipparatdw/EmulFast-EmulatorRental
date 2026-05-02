import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, ExtractJwt } from "passport-jwt";
import { Request } from "express";
import type { JwtPayload } from "../decorators/current-user.decorator.js";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  private readonly logger = new Logger(JwtRefreshStrategy.name);

  constructor(configService: ConfigService) {
    const secret = configService.get<string>("JWT_REFRESH_SECRET");
    if (!secret) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          const cookieToken = req?.cookies?.["refreshToken"] as string | undefined;
          return cookieToken ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.sub || !payload?.email || !payload?.role) {
      this.logger.warn("Refresh JWT payload missing required fields");
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid refresh token payload",
          messageKey: "errors.unauthorized",
        },
      });
    }
    return payload;
  }
}

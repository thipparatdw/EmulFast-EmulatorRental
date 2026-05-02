import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, ExtractJwt } from "passport-jwt";
import { Request } from "express";
import type { JwtPayload } from "../decorators/current-user.decorator.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(configService: ConfigService) {
    const secret = configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    super({
      // ดึง token จาก cookie 'accessToken' หรือ Authorization Bearer header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          const cookieToken = req?.cookies?.["accessToken"] as string | undefined;
          return cookieToken ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.sub || !payload?.email || !payload?.role) {
      this.logger.warn("JWT payload missing required fields");
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid token payload",
          messageKey: "errors.unauthorized",
        },
      });
    }
    return payload;
  }
}

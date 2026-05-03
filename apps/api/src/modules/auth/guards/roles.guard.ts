import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { JwtPayload } from "../decorators/current-user.decorator.js";
import type { Role } from "@emulfast/shared";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // ถ้าไม่มี @Roles() decorator — อนุญาตทุก authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: {
          code: "FORBIDDEN",
          message: "Access denied",
          messageKey: "errors.forbidden",
        },
      });
    }

    const hasRole = requiredRoles.includes(user.role as Role);
    if (!hasRole) {
      this.logger.warn(
        `User ${user.sub} (role: ${user.role}) attempted to access endpoint requiring roles: ${requiredRoles.join(", ")}`,
      );
      throw new ForbiddenException({
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions",
          messageKey: "errors.forbidden",
        },
      });
    }

    return true;
  }
}

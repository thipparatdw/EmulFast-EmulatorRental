import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard.js";
import { CurrentUser, type JwtPayload } from "./decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { ok } from "../../common/response.js";
import {
  RegisterInputSchema,
  LoginInputSchema,
  type RegisterInput,
  type LoginInput,
} from "@emulfast/shared";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days ms
  path: "/",
};

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 15 * 60 * 1000, // 15 min ms
  path: "/",
};

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/register
   * สร้าง user ใหม่ + wallet → return accessToken (body + cookie) + refreshToken (httpOnly cookie)
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterInputSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, accessTokenExpiresAt } =
      await this.authService.register(body);

    const refreshToken = this.authService.issueRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("accessToken", accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return ok({ user, accessToken, accessTokenExpiresAt });
  }

  /**
   * POST /api/auth/login
   * Verify credentials → return accessToken (body + cookie) + refreshToken (httpOnly cookie)
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginInputSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, accessTokenExpiresAt } =
      await this.authService.login(body);

    const refreshToken = this.authService.issueRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("accessToken", accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return ok({ user, accessToken, accessTokenExpiresAt });
  }

  /**
   * POST /api/auth/refresh
   * ดึง refreshToken จาก httpOnly cookie → issue new accessToken
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, accessTokenExpiresAt } =
      await this.authService.refreshToken(user.sub);

    res.cookie("accessToken", accessToken, ACCESS_COOKIE_OPTIONS);

    return ok({ accessToken, accessTokenExpiresAt });
  }

  /**
   * POST /api/auth/logout
   * Clear both cookies → { ok: true }
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/" });

    return ok({ ok: true });
  }

  /**
   * GET /api/auth/me
   * Return current user (from JWT)
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: JwtPayload) {
    const me = await this.authService.getMe(user.sub);
    return ok({ user: me });
  }
}

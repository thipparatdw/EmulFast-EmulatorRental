import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { UsersService } from "./users.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { CurrentUser, JwtPayload } from "../auth/decorators/current-user.decorator.js";
import {
  UpdateProfileInputSchema,
  ChangePasswordInputSchema,
} from "@emulfast/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── GET /users/me ────────────────────────────────────────────────────────

  @Get("me")
  async getMe(@CurrentUser() user: JwtPayload) {
    const profile = await this.usersService.getProfile(user.sub);
    return { data: profile };
  }

  // ─── PATCH /users/me ──────────────────────────────────────────────────────

  @Patch("me")
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateProfileInputSchema)) body: unknown,
  ) {
    const updated = await this.usersService.updateProfile(
      user.sub,
      body as Parameters<UsersService["updateProfile"]>[1],
    );
    return { data: updated };
  }

  // ─── POST /users/me/password ──────────────────────────────────────────────

  @Post("me/password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ChangePasswordInputSchema)) body: unknown,
  ) {
    const result = await this.usersService.changePassword(
      user.sub,
      body as Parameters<UsersService["changePassword"]>[1],
    );
    return { data: result };
  }
}

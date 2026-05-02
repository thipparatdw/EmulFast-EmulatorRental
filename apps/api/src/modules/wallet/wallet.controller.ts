import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../auth/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { ok } from "../../common/response.js";
import { WalletService } from "./wallet.service.js";
import { TopupInputSchema, type TopupInput } from "@emulfast/shared";

@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /api/wallet
   * ดึง balance + 20 transactions ล่าสุด
   */
  @Get()
  async getWallet(@CurrentUser() user: JwtPayload) {
    const wallet = await this.walletService.getWallet(user.sub);
    return ok({ wallet });
  }

  /**
   * POST /api/wallet/topup
   * สร้าง Stripe Checkout Session สำหรับ top-up Fcoin
   * Body: { amountThb: number }
   */
  @Post("topup")
  @HttpCode(HttpStatus.CREATED)
  async topup(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(TopupInputSchema)) body: TopupInput,
    @Req() req: Request,
  ) {
    const frontendBaseUrl =
      process.env["NEXT_PUBLIC_APP_URL"] ??
      `${req.protocol}://${req.get("host") ?? "localhost:3000"}`.replace(
        ":4000",
        ":3000",
      );
    const result = await this.walletService.createTopupCheckout(
      user.sub,
      body,
      frontendBaseUrl,
    );
    return ok(result);
  }
}

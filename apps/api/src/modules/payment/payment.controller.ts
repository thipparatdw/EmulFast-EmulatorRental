import {
  Controller,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service.js";

@Controller("payments")
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/payments/stripe/webhook
   *
   * Stripe webhook endpoint — ไม่ใช้ JwtAuthGuard
   * ต้องส่ง raw body ให้ Stripe ตรวจ signature
   *
   * ต้องตั้งค่า NestJS ให้ไม่ parse raw body:
   * ดู apps/api/src/main.ts — bodyParser option
   */
  @Post("stripe/webhook")
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Missing stripe-signature header",
          messageKey: "errors.payment.missing_signature",
        },
      });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error("rawBody is undefined — check bodyParser config in main.ts");
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Missing raw body",
          messageKey: "errors.payment.missing_body",
        },
      });
    }

    const event = this.paymentService.constructWebhookEvent(rawBody, signature);
    await this.paymentService.handleWebhookEvent(event);

    return { received: true };
  }
}

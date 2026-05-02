import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { OrderService } from "../order/order.service.js";
import { Prisma } from "@emulfast/db";
import { EmulatorService } from "../emulator/emulator.service.js";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly orderService: OrderService,
    private readonly emulatorService: EmulatorService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey =
      this.configService.get<string>("STRIPE_SECRET_KEY") ?? "";
    this.stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
  }

  // ─── Verify + parse Stripe webhook ────────────────────────────────────────

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret =
      this.configService.get<string>("STRIPE_WEBHOOK_SECRET") ?? "";

    if (!webhookSecret) {
      throw new InternalServerErrorException({
        error: {
          code: "INTERNAL",
          message: "Stripe webhook secret not configured",
          messageKey: "errors.internal",
        },
      });
    }

    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        `Stripe signature verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid Stripe signature",
          messageKey: "errors.payment.invalid_signature",
        },
      });
    }
  }

  // ─── Handle webhook event ─────────────────────────────────────────────────

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    // Idempotency: ตรวจว่า event นี้ถูก process ไปแล้วหรือยัง
    const existing = await this.prisma.payment.findFirst({
      where: { webhookEventId: event.id },
    });

    if (existing) {
      this.logger.debug(
        `Webhook event already processed: ${event.id} type=${event.type}`,
      );
      return;
    }

    this.logger.log(`Processing webhook: ${event.id} type=${event.type}`);

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
        );
        break;

      case "checkout.session.expired":
        await this.handleCheckoutSessionExpired(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  // ─── checkout.session.completed ───────────────────────────────────────────

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    const { orderId, userId, type, amountThb } = session.metadata ?? {};

    if (!orderId || !userId) {
      this.logger.error(
        `Webhook session missing metadata: sessionId=${session.id}`,
      );
      return;
    }

    // อัปเดต Payment record + set webhookEventId
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
    });

    if (!payment) {
      this.logger.error(
        `Payment record not found for orderId=${orderId}`,
      );
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        gatewayChargeId: session.payment_intent as string | null,
        webhookEventId: eventId,
        paidAt: new Date(),
      },
    });

    if (type === "wallet_topup") {
      // เติม Fcoin เข้า wallet (1 THB = 1 Fcoin)
      const amount = parseInt(amountThb ?? "0", 10);
      if (amount > 0) {
        const wallet = await this.walletService.getOrCreateWallet(userId);
        await this.walletService.creditFcoin(
          userId,
          wallet.id,
          orderId,
          new Prisma.Decimal(amount),
          "wallet.tx.topup",
        );
      }
      await this.orderService.markOrderPaid(orderId);

      this.logger.log(
        `Wallet topup completed: userId=${userId} orderId=${orderId} amount=${amountThb}`,
      );
    } else if (type === "emulator_renewal") {
      // ต่ออายุ emulator — ขยาย expiresAt (ไม่ restart)
      const { emulatorId, billingDays } = session.metadata ?? {};
      await this.orderService.markOrderPaid(orderId);

      if (emulatorId && billingDays) {
        await this.emulatorService.extendEmulatorExpiry(
          emulatorId,
          parseInt(billingDays, 10),
        );
      }

      this.logger.log(
        `Renewal paid via Stripe: orderId=${orderId} emulatorId=${emulatorId}`,
      );
    } else {
      // emulator_purchase
      await this.orderService.markOrderPaid(orderId);

      this.logger.log(
        `Order paid via Stripe: orderId=${orderId} userId=${userId} type=${type ?? "emulator_purchase"}`,
      );
    }
  }

  // ─── checkout.session.expired ─────────────────────────────────────────────

  private async handleCheckoutSessionExpired(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const { orderId } = session.metadata ?? {};
    if (!orderId) return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    await this.prisma.payment.updateMany({
      where: { orderId, status: "pending" },
      data: { status: "failed" },
    });

    this.logger.log(`Checkout session expired: orderId=${orderId}`);
  }
}

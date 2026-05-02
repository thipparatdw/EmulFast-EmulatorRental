import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  WalletResponse,
  TopupInput,
  TopupResponse,
} from "@emulfast/shared";
import { Prisma } from "@emulfast/db";

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey =
      this.configService.get<string>("STRIPE_SECRET_KEY") ?? "";
    this.stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
  }

  // ─── Get or create wallet ─────────────────────────────────────────────────

  async getOrCreateWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: new Prisma.Decimal(0), lockedBalance: new Prisma.Decimal(0) },
      update: {},
    });
  }

  // ─── GET /wallet ───────────────────────────────────────────────────────────

  async getWallet(userId: string): Promise<WalletResponse> {
    const wallet = await this.getOrCreateWallet(userId);

    const txs = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      balance: wallet.balance.toString(),
      transactions: txs.map((tx) => ({
        id: tx.id,
        type: tx.type as WalletResponse["transactions"][0]["type"],
        amount: tx.amount.toString(),
        balanceAfter: tx.balanceAfter.toString(),
        descriptionKey: tx.noteKey ?? `wallet.tx.${tx.type}`,
        orderId: tx.orderId ?? null,
        createdAt: tx.createdAt.toISOString(),
      })),
    };
  }

  // ─── POST /wallet/topup ────────────────────────────────────────────────────

  async createTopupCheckout(
    userId: string,
    input: TopupInput,
    frontendBaseUrl: string,
  ): Promise<TopupResponse> {
    const { amountThb } = input;

    // สร้าง order record ก่อน
    const orderNumber = `TU-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        type: "wallet_topup",
        currency: "THB",
        subtotal: new Prisma.Decimal(amountThb),
        discount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(amountThb),
        paymentMethod: "card",
        status: "awaiting_payment",
        billingDays: 0,
      },
    });

    // สร้าง Stripe Checkout Session
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create({
        mode: "payment",
        currency: "thb",
        line_items: [
          {
            price_data: {
              currency: "thb",
              product_data: {
                name: `EmulFast Wallet Top-up ${amountThb} THB`,
                description: `เติม Fcoin เทียบเท่า ${amountThb} Fcoin`,
              },
              unit_amount: amountThb * 100, // สตางค์
            },
            quantity: 1,
          },
        ],
        success_url: `${frontendBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendBaseUrl}/wallet`,
        metadata: {
          orderId: order.id,
          userId,
          type: "wallet_topup",
          amountThb: amountThb.toString(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Stripe topup session create failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // ลบ order ที่สร้างไว้
      await this.prisma.order.delete({ where: { id: order.id } });
      throw new InternalServerErrorException({
        error: {
          code: "PAYMENT_FAILED",
          message: "Failed to create checkout session",
          messageKey: "errors.payment.checkout_failed",
        },
      });
    }

    // บันทึก Stripe session id ใน Payment record
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        gateway: "stripe",
        method: "card",
        status: "pending",
        amount: new Prisma.Decimal(amountThb),
        currency: "THB",
        gatewayIntentId: session.id,
      },
    });

    return {
      orderId: order.id,
      checkoutUrl: session.url!,
    };
  }

  // ─── Credit Fcoin (called by webhook handler) ─────────────────────────────

  async creditFcoin(
    userId: string,
    walletId: string,
    orderId: string,
    amountFcoin: Prisma.Decimal,
    noteKey = "wallet.tx.topup",
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: amountFcoin } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId,
          userId,
          orderId,
          type: "topup",
          direction: "credit",
          amount: amountFcoin,
          balanceAfter: wallet.balance,
          noteKey,
        },
      });
    });

    this.logger.log(
      `Fcoin credited: userId=${userId} amount=${amountFcoin.toString()} orderId=${orderId}`,
    );
  }

  // ─── Deduct Fcoin (called by OrderService) ────────────────────────────────

  async deductFcoin(
    userId: string,
    orderId: string,
    amountFcoin: Prisma.Decimal,
    noteKey = "wallet.tx.spend",
  ): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.balance.lessThan(amountFcoin)) {
      throw new BadRequestException({
        error: {
          code: "INSUFFICIENT_FUNDS",
          message: "Insufficient Fcoin balance",
          messageKey: "errors.wallet.insufficient_funds",
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amountFcoin } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          orderId,
          type: "spend",
          direction: "debit",
          amount: amountFcoin,
          balanceAfter: updated.balance,
          noteKey,
        },
      });
    });

    this.logger.log(
      `Fcoin deducted: userId=${userId} amount=${amountFcoin.toString()} orderId=${orderId}`,
    );
  }
}

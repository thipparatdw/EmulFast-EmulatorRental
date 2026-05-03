import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { PackageService } from "../package/package.service.js";
import type {
  CreateOrderInput,
  OrderResponse,
  OrderStatusResponse,
} from "@emulfast/shared";
import { Prisma } from "@emulfast/db";

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateOrderNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { package: true; payment: true; emulator: true };
}>;

function mapOrderToResponse(order: OrderWithRelations): OrderResponse {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    type: order.type as OrderResponse["type"],
    packageCode: (order.package?.code ?? null) as OrderResponse["packageCode"],
    paymentMethod: order.paymentMethod as OrderResponse["paymentMethod"],
    status: order.status as OrderResponse["status"],
    billingDays: order.billingDays ?? null,
    subtotal: order.subtotal.toString(),
    discount: order.discount.toString(),
    total: order.total.toString(),
    currency: order.currency,
    stripeCheckoutUrl: null, // URL ไม่เก็บใน DB — ส่งเฉพาะตอน create
    stripeSessionId: order.payment?.gatewayIntentId ?? null,
    // emulatorId = emulator ที่ order นี้สร้าง (OrderToEmulator relation)
    emulatorId: order.emulator?.id ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly packageService: PackageService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey =
      this.configService.get<string>("STRIPE_SECRET_KEY") ?? "";
    this.stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
  }

  private get frontendBaseUrl(): string {
    return (
      this.configService.get<string>("NEXT_PUBLIC_APP_URL") ??
      "http://localhost:3000"
    );
  }

  // ─── List orders ───────────────────────────────────────────────────────────

  async listOrders(userId: string): Promise<OrderResponse[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { package: true, payment: true, emulator: true },
    });
    return orders.map(mapOrderToResponse);
  }

  // ─── Get one ──────────────────────────────────────────────────────────────

  async getOrder(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, deletedAt: null },
      include: { package: true, payment: true, emulator: true },
    });

    if (!order) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Order not found",
          messageKey: "errors.order.not_found",
        },
      });
    }

    return mapOrderToResponse(order);
  }

  // ─── Order status (poll) ───────────────────────────────────────────────────

  async getOrderStatus(userId: string, orderId: string): Promise<OrderStatusResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        emulatorId: true,
        payment: { select: { gatewayIntentId: true } },
      },
    });

    if (!order) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Order not found",
          messageKey: "errors.order.not_found",
        },
      });
    }

    return {
      orderId: order.id,
      status: order.status as OrderStatusResponse["status"],
      emulatorId: order.emulatorId ?? null,
      checkoutUrl: null, // URL ไม่เก็บใน DB
    };
  }

  // ─── Create order ──────────────────────────────────────────────────────────

  async createOrder(
    userId: string,
    input: CreateOrderInput,
  ): Promise<{ order: OrderResponse; checkoutUrl: string | null }> {
    const { packageCode, paymentMethod, billingDays } = input;

    // ดึง package
    const pkg = await this.packageService.getPackageByCode(packageCode);

    // คำนวณราคา
    const pricePerDay = new Prisma.Decimal(pkg.pricePerDay);
    const fcoinPerDay = new Prisma.Decimal(pkg.fcoinPerDay);
    const subtotal = pricePerDay.mul(billingDays);
    const fcoinTotal = fcoinPerDay.mul(billingDays);
    const discount = new Prisma.Decimal(0);
    const total = subtotal.minus(discount);

    const orderNumber = generateOrderNumber("EM");

    if (paymentMethod === "card") {
      return this.createCardOrder(
        userId,
        orderNumber,
        pkg.id,
        packageCode,
        subtotal,
        discount,
        total,
        billingDays,
      );
    }

    if (paymentMethod === "fcoin") {
      return this.createFcoinOrder(
        userId,
        orderNumber,
        pkg.id,
        packageCode,
        subtotal,
        discount,
        total,
        fcoinTotal,
        billingDays,
      );
    }

    throw new BadRequestException({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payment method",
        messageKey: "errors.order.invalid_payment_method",
      },
    });
  }

  // ─── Card order → Stripe Checkout Session ────────────────────────────────

  private async createCardOrder(
    userId: string,
    orderNumber: string,
    packageId: string,
    packageCode: string,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
    total: Prisma.Decimal,
    billingDays: number,
  ): Promise<{ order: OrderResponse; checkoutUrl: string }> {
    // สร้าง order (awaiting_payment)
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        type: "emulator_purchase",
        packageId,
        currency: "THB",
        subtotal,
        discount,
        total,
        paymentMethod: "card",
        status: "awaiting_payment",
        billingDays,
      },
      include: { package: true, payment: true, emulator: true },
    });

    // Stripe Checkout Session
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
                name: `EmulFast ${packageCode} — ${billingDays} วัน`,
              },
              unit_amount: Math.round(total.toNumber() * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${this.frontendBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.frontendBaseUrl}/packages`,
        metadata: {
          orderId: order.id,
          userId,
          type: "emulator_purchase",
        },
      });
    } catch (err) {
      this.logger.error(
        `Stripe checkout session failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: "failed" },
      });
      throw new InternalServerErrorException({
        error: {
          code: "PAYMENT_FAILED",
          message: "Failed to create checkout session",
          messageKey: "errors.payment.checkout_failed",
        },
      });
    }

    // สร้าง Payment record
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        gateway: "stripe",
        method: "card",
        status: "pending",
        amount: total,
        currency: "THB",
        gatewayIntentId: session.id,
      },
    });

    const updatedOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { package: true, payment: true, emulator: true },
    });

    return {
      order: mapOrderToResponse(updatedOrder),
      checkoutUrl: session.url!,
    };
  }

  // ─── Fcoin order → deduct wallet → mark paid ─────────────────────────────

  private async createFcoinOrder(
    userId: string,
    orderNumber: string,
    packageId: string,
    packageCode: string,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
    total: Prisma.Decimal,
    fcoinTotal: Prisma.Decimal,
    billingDays: number,
  ): Promise<{ order: OrderResponse; checkoutUrl: null }> {
    // สร้าง order (pending ก่อน)
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        type: "emulator_purchase",
        packageId,
        currency: "THB",
        subtotal,
        discount,
        total,
        fcoinAmount: fcoinTotal,
        paymentMethod: "fcoin",
        status: "pending",
        billingDays,
      },
    });

    // Deduct Fcoin (throw INSUFFICIENT_FUNDS ถ้าไม่พอ)
    await this.walletService.deductFcoin(
      userId,
      order.id,
      fcoinTotal,
      "wallet.tx.spend",
    );

    // Mark order paid + สร้าง Payment record
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "paid", paidAt: new Date() },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          gateway: "fcoin",
          method: "fcoin",
          status: "succeeded",
          amount: total,
          currency: "THB",
          paidAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Fcoin order paid: orderId=${order.id} user=${userId} pkg=${packageCode} fcoin=${fcoinTotal.toString()}`,
    );

    const updatedOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { package: true, payment: true, emulator: true },
    });

    return { order: mapOrderToResponse(updatedOrder), checkoutUrl: null };
  }

  // ─── Mark order paid (called by webhook) ──────────────────────────────────

  async markOrderPaid(orderId: string): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "paid", paidAt: new Date() },
    });
    this.logger.log(`Order marked paid: orderId=${orderId}`);
  }
}

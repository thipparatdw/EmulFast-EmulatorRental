import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import Stripe from "stripe";
import { PrismaService } from "../../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { PackageService } from "../package/package.service.js";
import { EmulatorGateway } from "./emulator.gateway.js";
import type { Emulator } from "@emulfast/db";
import { Prisma } from "@emulfast/db";
import type {
  EmulatorResponse,
  EmulatorStatus,
  PackageCode,
} from "@emulfast/shared";
import type { RenewEmulatorDto } from "./dto/renew-emulator.dto.js";

// ─── Orchestrator response types ─────────────────────────────────────────────

interface OrchestratorCreateResponse {
  containerId: string;
  containerName: string;
  adbPort: number;
  websocketPath: string;
}

interface OrchestratorContainerInfo {
  id: string;
  state: string;
}

// ─── Package sub-type (Prisma include shape) ─────────────────────────────────

interface EmulatorWithPackage extends Emulator {
  package: {
    code: string;
    nameKey: string;
    androidVersion: string;
    cpuCores: number;
    ramMb: number;
    romGb: number;
  };
}

@Injectable()
export class EmulatorService {
  private readonly logger = new Logger(EmulatorService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly gateway: EmulatorGateway,
    private readonly walletService: WalletService,
    private readonly packageService: PackageService,
  ) {
    const stripeKey = this.configService.get<string>("STRIPE_SECRET_KEY") ?? "";
    this.stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private get orchestratorUrl(): string {
    return (
      this.configService.get<string>("ORCHESTRATOR_URL") ??
      "http://localhost:5000"
    );
  }

  private get orchestratorToken(): string {
    return this.configService.get<string>("ORCHESTRATOR_TOKEN") ?? "";
  }

  private get wsBaseUrl(): string {
    return (
      this.configService.get<string>("WEBSOCKET_BASE_URL") ??
      "ws://localhost:8000"
    );
  }

  private orchestratorHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.orchestratorToken}` };
  }

  mapToResponse(
    emulator: EmulatorWithPackage,
    wsBaseUrl?: string,
  ): EmulatorResponse {
    const base = wsBaseUrl ?? this.wsBaseUrl;
    return {
      id: emulator.id,
      userId: emulator.userId,
      packageCode: emulator.package.code as PackageCode,
      package: {
        code: emulator.package.code as PackageCode,
        nameKey: emulator.package.nameKey,
        androidVersion: emulator.package.androidVersion,
        cpuCores: emulator.package.cpuCores,
        ramMb: emulator.package.ramMb,
        romGb: emulator.package.romGb,
      },
      status: emulator.status as EmulatorStatus,
      failureReasonKey: emulator.failureReason ?? null,
      websocketUrl: emulator.websocketPath
        ? `${base}${emulator.websocketPath}`
        : null,
      hostNode: emulator.hostNode,
      expiresAt: emulator.expiresAt.toISOString(),
      lastHeartbeatAt: emulator.lastHeartbeatAt?.toISOString() ?? null,
      startedAt: emulator.startedAt?.toISOString() ?? null,
      stoppedAt: emulator.stoppedAt?.toISOString() ?? null,
      createdAt: emulator.createdAt.toISOString(),
      updatedAt: emulator.updatedAt.toISOString(),
    };
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async listEmulators(userId: string): Promise<EmulatorResponse[]> {
    const emulators = await this.prisma.emulator.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { package: true },
    });
    return emulators.map((e) => this.mapToResponse(e));
  }

  // ─── Get one ──────────────────────────────────────────────────────────────

  async getEmulator(userId: string, id: string): Promise<EmulatorResponse> {
    const emulator = await this.prisma.emulator.findFirst({
      where: { id, userId, deletedAt: null },
      include: { package: true },
    });

    if (!emulator) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Emulator not found",
          messageKey: "errors.emulator.not_found",
        },
      });
    }

    return this.mapToResponse(emulator);
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async createEmulator(
    userId: string,
    orderId: string,
  ): Promise<EmulatorResponse> {
    // 1. ตรวจ order ว่ามีอยู่, เป็นของ user คนนี้, สถานะ paid
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, status: "paid" },
      include: { package: true },
    });

    if (!order) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Order not found or not eligible",
          messageKey: "errors.order.not_found",
        },
      });
    }

    if (!order.package) {
      throw new InternalServerErrorException({
        error: {
          code: "INTERNAL",
          message: "Order has no package",
          messageKey: "errors.internal",
        },
      });
    }

    // 2. ตรวจว่า order นี้ยังไม่มี emulator
    const existingEmulator = await this.prisma.emulator.findFirst({
      where: { orderId },
    });

    if (existingEmulator) {
      throw new ConflictException({
        error: {
          code: "CONFLICT",
          message: "Emulator already exists for this order",
          messageKey: "errors.emulator.already_exists",
        },
      });
    }

    // 3. คำนวณ expiresAt
    const expiresAt = new Date(
      Date.now() + order.billingDays * 24 * 60 * 60 * 1000,
    );

    // 4. เรียก Orchestrator สร้าง container
    let orchestratorData: OrchestratorCreateResponse;
    try {
      const response = await firstValueFrom(
        this.httpService.post<OrchestratorCreateResponse>(
          `${this.orchestratorUrl}/containers`,
          {
            userId,
            packageCode: order.package.code,
            androidVersion: order.package.androidVersion,
            expiresAt: expiresAt.toISOString(),
          },
          { headers: this.orchestratorHeaders() },
        ),
      );
      orchestratorData = response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(
        `Orchestrator create failed: ${axiosErr.message}`,
        axiosErr.stack,
      );
      throw new InternalServerErrorException({
        error: {
          code: "ORCHESTRATOR_ERROR",
          message: "Failed to provision emulator",
          messageKey: "errors.emulator.provision_failed",
        },
      });
    }

    // 5. สร้าง Emulator record ใน DB
    const created = await this.prisma.emulator.create({
      data: {
        userId,
        packageId: order.packageId!,
        orderId,
        containerId: orchestratorData.containerId,
        hostNode: "default",
        adbPort: orchestratorData.adbPort,
        websocketPath: orchestratorData.websocketPath,
        status: "provisioning",
        expiresAt,
      },
    });

    // 6. Order status ยังคงเป็น 'paid' (schema ไม่มี 'processing')
    // ไม่ต้อง update status แต่ record ว่า emulator ถูกสร้างแล้ว (ผ่าน Emulator.orderId)

    this.logger.log(
      `Emulator created: id=${created.id} container=${orchestratorData.containerId} user=${userId}`,
    );

    // Schedule mark-running after Android boot (~35s for zygote + ADB connect)
    this.scheduleMarkRunning(created.id, orchestratorData.containerId, 40_000);

    // Re-fetch พร้อม package เพื่อให้ mapToResponse ได้ข้อมูลครบ
    const emulatorWithPkg = await this.prisma.emulator.findUniqueOrThrow({
      where: { id: created.id },
      include: { package: true },
    });

    return this.mapToResponse(emulatorWithPkg);
  }

  // ─── Mark provisioning emulator as running once container is up ────────────

  private scheduleMarkRunning(emulatorId: string, containerId: string, delayMs: number): void {
    setTimeout(() => {
      void this.checkAndMarkRunning(emulatorId, containerId);
    }, delayMs);
  }

  async checkAndMarkRunning(emulatorId: string, containerId: string): Promise<void> {
    let containerState: string | null = null;
    try {
      const res = await firstValueFrom(
        this.httpService.get<OrchestratorContainerInfo>(
          `${this.orchestratorUrl}/containers/${containerId}`,
          { headers: this.orchestratorHeaders() },
        ),
      );
      containerState = res.data.state;
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 404) {
        // Container gone — mark failed
        await this.markEmulatorFailed(emulatorId);
      }
      return;
    }

    if (containerState !== "running") {
      // Not ready yet — retry in 10s
      this.scheduleMarkRunning(emulatorId, containerId, 10_000);
      return;
    }

    const emulator = await this.prisma.emulator.findFirst({
      where: { id: emulatorId, status: "provisioning", deletedAt: null },
    });
    if (!emulator) return;

    const updated = await this.prisma.emulator.update({
      where: { id: emulatorId },
      data: { status: "running", startedAt: new Date() },
    });

    this.gateway.emitStatusUpdate(emulator.userId, emulatorId, "running", updated.expiresAt);
    this.logger.log(`Emulator marked running: id=${emulatorId}`);
  }

  private async markEmulatorFailed(emulatorId: string): Promise<void> {
    const emulator = await this.prisma.emulator.findFirst({
      where: { id: emulatorId, status: "provisioning", deletedAt: null },
    });
    if (!emulator) return;

    const updated = await this.prisma.emulator.update({
      where: { id: emulatorId },
      data: { status: "failed", stoppedAt: new Date() },
    });

    this.gateway.emitStatusUpdate(emulator.userId, emulatorId, "failed", updated.expiresAt);
    this.logger.warn(`Emulator marked failed (container gone): id=${emulatorId}`);
  }

  // ─── Terminate running emulators whose containers no longer exist ──────────

  async terminateOrphanedEmulators(): Promise<void> {
    const running = await this.prisma.emulator.findMany({
      where: { status: "running", deletedAt: null, containerId: { not: null } },
    });

    for (const emulator of running) {
      try {
        await firstValueFrom(
          this.httpService.get<OrchestratorContainerInfo>(
            `${this.orchestratorUrl}/containers/${emulator.containerId!}`,
            { headers: this.orchestratorHeaders() },
          ),
        );
      } catch (err) {
        if ((err as AxiosError).response?.status === 404) {
          await this.prisma.emulator.update({
            where: { id: emulator.id },
            data: { status: "terminated", stoppedAt: new Date() },
          });
          this.gateway.emitStatusUpdate(emulator.userId, emulator.id, "stopped", emulator.expiresAt);
          this.logger.warn(`Emulator terminated (orphaned container): id=${emulator.id}`);
        }
      }
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteEmulator(
    userId: string,
    id: string,
  ): Promise<EmulatorResponse> {
    const emulator = await this.prisma.emulator.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!emulator) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Emulator not found",
          messageKey: "errors.emulator.not_found",
        },
      });
    }

    // เรียก Orchestrator ลบ container (ignore 404)
    if (emulator.containerId) {
      try {
        await firstValueFrom(
          this.httpService.delete(
            `${this.orchestratorUrl}/containers/${emulator.containerId}`,
            { headers: this.orchestratorHeaders() },
          ),
        );
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;
        if (status !== 404) {
          this.logger.warn(
            `Orchestrator delete failed (non-404): ${axiosErr.message} container=${emulator.containerId}`,
          );
        }
      }
    }

    // Update DB: terminated + soft delete
    const updated = await this.prisma.emulator.update({
      where: { id },
      data: {
        status: "terminated",
        stoppedAt: new Date(),
        deletedAt: new Date(),
      },
    });

    this.logger.log(`Emulator deleted: id=${id} user=${userId}`);

    // Emit WS event
    this.gateway.emitStatusUpdate(userId, id, "stopped", updated.expiresAt);

    // Re-fetch พร้อม package เพื่อให้ mapToResponse ได้ข้อมูลครบ
    const updatedWithPkg = await this.prisma.emulator.findUniqueOrThrow({
      where: { id },
      include: { package: true },
    });

    return this.mapToResponse(updatedWithPkg);
  }

  // ─── Renew ─────────────────────────────────────────────────────────────────

  async renewEmulator(
    userId: string,
    emulatorId: string,
    dto: RenewEmulatorDto,
  ): Promise<{ order: { id: string; status: string; checkoutUrl: string | null }; emulator: EmulatorResponse }> {
    const emulator = await this.prisma.emulator.findFirst({
      where: { id: emulatorId, userId, deletedAt: null },
      include: { package: true },
    });

    if (!emulator) {
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: "Emulator not found",
          messageKey: "errors.emulator.not_found",
        },
      });
    }

    if (["terminated", "failed"].includes(emulator.status)) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Cannot renew a terminated or failed emulator",
          messageKey: "errors.emulator.not_renewable",
        },
      });
    }

    const { packageCode, paymentMethod, billingDays } = dto;
    const pkg = await this.packageService.getPackageByCode(packageCode);
    const pricePerDay = new Prisma.Decimal(pkg.pricePerDay);
    const fcoinPerDay = new Prisma.Decimal(pkg.fcoinPerDay);
    const subtotal = pricePerDay.mul(billingDays);
    const fcoinTotal = fcoinPerDay.mul(billingDays);
    const discount = new Prisma.Decimal(0);
    const total = subtotal.minus(discount);
    const orderNumber = `RN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (paymentMethod === "fcoin") {
      // Deduct Fcoin → extend expiresAt immediately (no restart)
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          userId,
          type: "emulator_renewal",
          packageId: pkg.id,
          emulatorId,
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

      await this.walletService.deductFcoin(
        userId,
        order.id,
        fcoinTotal,
        "wallet.tx.spend",
      );

      // Extend expiresAt
      const currentExpiry = emulator.expiresAt < new Date()
        ? new Date()
        : emulator.expiresAt;
      const newExpiresAt = new Date(
        currentExpiry.getTime() + billingDays * 24 * 60 * 60 * 1000,
      );

      const [updatedOrder, updatedEmulator] = await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: "paid", paidAt: new Date(), expiresAt: newExpiresAt },
        }),
        this.prisma.emulator.update({
          where: { id: emulatorId },
          data: { expiresAt: newExpiresAt },
          include: { package: true },
        }),
      ]);

      await this.prisma.payment.create({
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

      this.gateway.emitStatusUpdate(
        userId,
        emulatorId,
        updatedEmulator.status as EmulatorStatus,
        newExpiresAt,
      );

      this.logger.log(
        `Emulator renewed via Fcoin: id=${emulatorId} newExpiry=${newExpiresAt.toISOString()}`,
      );

      return {
        order: { id: updatedOrder.id, status: updatedOrder.status, checkoutUrl: null },
        emulator: this.mapToResponse(updatedEmulator as EmulatorWithPackage),
      };
    }

    // Card payment → สร้าง Stripe Checkout Session
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        type: "emulator_renewal",
        packageId: pkg.id,
        emulatorId,
        currency: "THB",
        subtotal,
        discount,
        total,
        paymentMethod: "card",
        status: "awaiting_payment",
        billingDays,
      },
    });

    const frontendBaseUrl =
      this.configService.get<string>("NEXT_PUBLIC_APP_URL") ??
      "http://localhost:3000";

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
                name: `EmulFast ${packageCode} Renewal — ${billingDays} วัน`,
              },
              unit_amount: Math.round(total.toNumber() * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${frontendBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendBaseUrl}/emulators/${emulatorId}`,
        metadata: {
          orderId: order.id,
          userId,
          type: "emulator_renewal",
          emulatorId,
          billingDays: billingDays.toString(),
        },
      });
    } catch (err) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: "failed" },
      });
      throw new InternalServerErrorException({
        error: {
          code: "PAYMENT_FAILED",
          message: "Failed to create renewal checkout session",
          messageKey: "errors.payment.checkout_failed",
        },
      });
    }

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

    const emulatorWithPkg = await this.prisma.emulator.findUniqueOrThrow({
      where: { id: emulatorId },
      include: { package: true },
    });

    return {
      order: {
        id: order.id,
        status: order.status,
        checkoutUrl: session.url!,
      },
      emulator: this.mapToResponse(emulatorWithPkg),
    };
  }

  // ─── Extend expiresAt after renewal payment (called by webhook) ───────────

  async extendEmulatorExpiry(
    emulatorId: string,
    billingDays: number,
  ): Promise<void> {
    const emulator = await this.prisma.emulator.findUnique({
      where: { id: emulatorId },
    });

    if (!emulator) {
      this.logger.warn(`Emulator not found for renewal extension: id=${emulatorId}`);
      return;
    }

    const currentExpiry = emulator.expiresAt < new Date()
      ? new Date()
      : emulator.expiresAt;
    const newExpiresAt = new Date(
      currentExpiry.getTime() + billingDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.emulator.update({
      where: { id: emulatorId },
      data: { expiresAt: newExpiresAt },
    });

    this.gateway.emitStatusUpdate(
      emulator.userId,
      emulatorId,
      emulator.status as EmulatorStatus,
      newExpiresAt,
    );

    this.logger.log(
      `Emulator expiry extended: id=${emulatorId} newExpiry=${newExpiresAt.toISOString()}`,
    );
  }

  // ─── Expiry scan (used by processor) ──────────────────────────────────────

  // ─── Recovery: re-schedule mark-running for emulators stuck in provisioning ─

  async recoverProvisioningEmulators(): Promise<void> {
    const stale = await this.prisma.emulator.findMany({
      where: {
        status: "provisioning",
        deletedAt: null,
        // Only those created more than 30s ago (boot should be done)
        createdAt: { lt: new Date(Date.now() - 30_000) },
      },
    });

    for (const emulator of stale) {
      if (emulator.containerId) {
        void this.checkAndMarkRunning(emulator.id, emulator.containerId);
      }
    }
  }

  async processExpiredEmulators(): Promise<void> {
    const expiredEmulators = await this.prisma.emulator.findMany({
      where: {
        status: { notIn: ["expired", "terminated", "failed"] },
        expiresAt: { lt: new Date() },
        deletedAt: null,
      },
    });

    if (expiredEmulators.length === 0) return;

    this.logger.log(`Found ${expiredEmulators.length} expired emulator(s)`);

    for (const emulator of expiredEmulators) {
      // ลบ container จาก orchestrator (ignore errors)
      if (emulator.containerId) {
        try {
          await firstValueFrom(
            this.httpService.delete(
              `${this.orchestratorUrl}/containers/${emulator.containerId}`,
              { headers: this.orchestratorHeaders() },
            ),
          );
        } catch (err) {
          const axiosErr = err as AxiosError;
          this.logger.warn(
            `Orchestrator delete on expiry failed: ${axiosErr.message} container=${emulator.containerId}`,
          );
        }
      }

      // Update status → expired
      await this.prisma.emulator.update({
        where: { id: emulator.id },
        data: {
          status: "expired",
          stoppedAt: new Date(),
        },
      });

      // Emit WS event
      this.gateway.emitStatusUpdate(
        emulator.userId,
        emulator.id,
        "expired",
        emulator.expiresAt,
      );

      this.logger.log(`Emulator expired: id=${emulator.id} user=${emulator.userId}`);
    }
  }

  // ─── Expiring-soon warning (15 min before) ────────────────────────────────

  async warnExpiringEmulators(): Promise<void> {
    const warnThreshold = new Date(Date.now() + 15 * 60 * 1000); // +15 min
    const nowMs = Date.now();

    const soonEmulators = await this.prisma.emulator.findMany({
      where: {
        status: "running",
        expiresAt: { lte: warnThreshold, gt: new Date() },
        deletedAt: null,
      },
    });

    for (const emulator of soonEmulators) {
      const minutesLeft = Math.max(
        0,
        Math.floor((emulator.expiresAt.getTime() - nowMs) / 60_000),
      );
      this.gateway.emitExpiring(emulator.userId, emulator.id, minutesLeft);
    }
  }
}

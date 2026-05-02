import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderService } from "./order.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { PackageService } from "../package/package.service.js";
import { Prisma } from "@emulfast/db";

// ─── Mock Stripe ─────────────────────────────────────────────────────────────
const mockStripeCheckoutCreate = jest.fn();
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate,
      },
    },
  }));
});

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockPackage = {
  id: "pkg_001",
  code: "SFAST",
  nameKey: "package.sfast.name",
  descriptionKey: null,
  androidVersion: "10",
  cpuCores: 3,
  ramMb: 3072,
  romGb: 30,
  pricePerDay: "10.00",
  pricePerMonth: "300.00",
  fcoinPerDay: "10.0000",
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockOrder = {
  id: "order_001",
  orderNumber: "EM-12345-ABCD",
  userId: "user_001",
  type: "emulator_purchase" as const,
  packageId: "pkg_001",
  emulatorId: null,
  promocodeId: null,
  currency: "THB",
  subtotal: new Prisma.Decimal("300.00"),
  discount: new Prisma.Decimal("0"),
  total: new Prisma.Decimal("300.00"),
  fcoinAmount: null,
  paymentMethod: "card" as const,
  status: "awaiting_payment" as const,
  billingDays: 30,
  expiresAt: null,
  createdById: null,
  metadata: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
  paidAt: null,
  cancelledAt: null,
  package: {
    code: "SFAST",
  },
  payment: {
    gatewayIntentId: "cs_test_session_123",
  },
  emulator: null,
};

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  payment: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockWalletService = {
  deductFcoin: jest.fn(),
};

const mockPackageService = {
  getPackageByCode: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === "STRIPE_SECRET_KEY") return "sk_test_mock";
    if (key === "NEXT_PUBLIC_APP_URL") return "http://localhost:3000";
    return undefined;
  }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("OrderService", () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PackageService, useValue: mockPackageService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // ─── listOrders ──────────────────────────────────────────────────────────────

  describe("listOrders", () => {
    it("should return orders for a user", async () => {
      mockPrisma.order.findMany.mockResolvedValueOnce([mockOrder]);

      const result = await service.listOrders("user_001");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("order_001");
      expect(result[0].packageCode).toBe("SFAST");
      expect(result[0].status).toBe("awaiting_payment");
    });

    it("should return empty array if no orders", async () => {
      mockPrisma.order.findMany.mockResolvedValueOnce([]);

      const result = await service.listOrders("user_001");

      expect(result).toHaveLength(0);
    });
  });

  // ─── getOrder ────────────────────────────────────────────────────────────────

  describe("getOrder", () => {
    it("should return order when found", async () => {
      mockPrisma.order.findFirst.mockResolvedValueOnce(mockOrder);

      const result = await service.getOrder("user_001", "order_001");

      expect(result.id).toBe("order_001");
      expect(result.stripeSessionId).toBe("cs_test_session_123");
    });

    it("should throw NotFoundException when order not found", async () => {
      mockPrisma.order.findFirst.mockResolvedValueOnce(null);

      await expect(service.getOrder("user_001", "not_exist")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getOrderStatus ───────────────────────────────────────────────────────────

  describe("getOrderStatus", () => {
    it("should return order status", async () => {
      mockPrisma.order.findFirst.mockResolvedValueOnce({
        id: "order_001",
        status: "paid",
        emulatorId: "emu_001",
        payment: { gatewayIntentId: "cs_test_123" },
      });

      const result = await service.getOrderStatus("user_001", "order_001");

      expect(result.orderId).toBe("order_001");
      expect(result.status).toBe("paid");
      expect(result.emulatorId).toBe("emu_001");
    });

    it("should throw NotFoundException when order not found", async () => {
      mockPrisma.order.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getOrderStatus("user_001", "missing"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createOrder (card) ───────────────────────────────────────────────────────

  describe("createOrder (card)", () => {
    it("should create card order and return Stripe checkoutUrl", async () => {
      mockPackageService.getPackageByCode.mockResolvedValueOnce(mockPackage);
      mockPrisma.order.create.mockResolvedValueOnce(mockOrder);
      mockStripeCheckoutCreate.mockResolvedValueOnce({
        id: "cs_test_session_123",
        url: "https://checkout.stripe.com/pay/cs_test_session_123",
      });
      mockPrisma.payment.create.mockResolvedValueOnce({});
      mockPrisma.order.findUniqueOrThrow.mockResolvedValueOnce(mockOrder);

      const result = await service.createOrder("user_001", {
        packageCode: "SFAST",
        paymentMethod: "card",
        billingDays: 30,
      });

      expect(result.checkoutUrl).toBe(
        "https://checkout.stripe.com/pay/cs_test_session_123",
      );
      expect(result.order.status).toBe("awaiting_payment");
      expect(mockStripeCheckoutCreate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── createOrder (fcoin) ──────────────────────────────────────────────────────

  describe("createOrder (fcoin)", () => {
    it("should create fcoin order, deduct wallet, mark paid", async () => {
      mockPackageService.getPackageByCode.mockResolvedValueOnce(mockPackage);

      const fcoinOrder = {
        ...mockOrder,
        paymentMethod: "fcoin" as const,
        status: "pending" as const,
        payment: null,
        emulator: null,
      };

      mockPrisma.order.create.mockResolvedValueOnce(fcoinOrder);
      mockWalletService.deductFcoin.mockResolvedValueOnce(undefined);
      mockPrisma.$transaction.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (tx: any) => Promise<void>) => {
          const tx = {
            order: { update: jest.fn().mockResolvedValueOnce({ ...fcoinOrder, status: "paid" }) },
            payment: { create: jest.fn() },
          };
          return fn(tx);
        },
      );
      mockPrisma.order.findUniqueOrThrow.mockResolvedValueOnce({
        ...fcoinOrder,
        status: "paid",
      });

      const result = await service.createOrder("user_001", {
        packageCode: "SFAST",
        paymentMethod: "fcoin",
        billingDays: 30,
      });

      expect(result.checkoutUrl).toBeNull();
      expect(mockWalletService.deductFcoin).toHaveBeenCalledTimes(1);
    });
  });

  // ─── markOrderPaid ────────────────────────────────────────────────────────────

  describe("markOrderPaid", () => {
    it("should update order status to paid", async () => {
      mockPrisma.order.update.mockResolvedValueOnce({ ...mockOrder, status: "paid" });

      await expect(service.markOrderPaid("order_001")).resolves.not.toThrow();
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: "order_001" },
        data: expect.objectContaining({ status: "paid" }),
      });
    });
  });
});

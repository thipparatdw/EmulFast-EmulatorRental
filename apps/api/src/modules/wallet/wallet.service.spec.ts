import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WalletService } from "./wallet.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
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
const mockWallet = {
  id: "wallet_001",
  userId: "user_001",
  balance: new Prisma.Decimal("100.0000"),
  lockedBalance: new Prisma.Decimal("0"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockTx = {
  id: "tx_001",
  walletId: "wallet_001",
  userId: "user_001",
  orderId: "order_001",
  type: "topup" as const,
  direction: "credit" as const,
  amount: new Prisma.Decimal("50.0000"),
  balanceAfter: new Prisma.Decimal("150.0000"),
  noteKey: "wallet.tx.topup",
  metadata: null,
  createdById: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ─── Mock PrismaService ───────────────────────────────────────────────────────
const mockPrisma = {
  wallet: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  order: {
    create: jest.fn(),
    delete: jest.fn(),
  },
  payment: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === "STRIPE_SECRET_KEY") return "sk_test_mock";
    return undefined;
  }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("WalletService", () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  // ─── getWallet ───────────────────────────────────────────────────────────────

  describe("getWallet", () => {
    it("should return wallet balance and transactions", async () => {
      mockPrisma.wallet.upsert.mockResolvedValueOnce(mockWallet);
      mockPrisma.walletTransaction.findMany.mockResolvedValueOnce([mockTx]);

      const result = await service.getWallet("user_001");

      expect(result.balance).toBe("100");
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe("topup");
      expect(result.transactions[0].amount).toBe("50");
    });

    it("should return empty transactions if none exist", async () => {
      mockPrisma.wallet.upsert.mockResolvedValueOnce(mockWallet);
      mockPrisma.walletTransaction.findMany.mockResolvedValueOnce([]);

      const result = await service.getWallet("user_001");

      expect(result.transactions).toHaveLength(0);
    });
  });

  // ─── deductFcoin ─────────────────────────────────────────────────────────────

  describe("deductFcoin", () => {
    it("should deduct Fcoin and create transaction record", async () => {
      mockPrisma.wallet.upsert.mockResolvedValueOnce(mockWallet);
      mockPrisma.$transaction.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (tx: any) => Promise<void>) => {
          const tx = {
            wallet: { update: jest.fn().mockResolvedValueOnce({ balance: new Prisma.Decimal("50") }) },
            walletTransaction: { create: jest.fn() },
          };
          return fn(tx);
        },
      );

      await expect(
        service.deductFcoin("user_001", "order_001", new Prisma.Decimal("50.0000")),
      ).resolves.not.toThrow();
    });

    it("should throw BadRequestException when balance is insufficient", async () => {
      // Balance 100, trying to deduct 200
      mockPrisma.wallet.upsert.mockResolvedValueOnce(mockWallet);

      await expect(
        service.deductFcoin("user_001", "order_001", new Prisma.Decimal("200.0000")),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw with INSUFFICIENT_FUNDS code", async () => {
      mockPrisma.wallet.upsert.mockResolvedValueOnce(mockWallet);

      try {
        await service.deductFcoin("user_001", "order_001", new Prisma.Decimal("999"));
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          error: { code: "INSUFFICIENT_FUNDS" },
        });
      }
    });
  });

  // ─── creditFcoin ─────────────────────────────────────────────────────────────

  describe("creditFcoin", () => {
    it("should credit Fcoin and create transaction record", async () => {
      mockPrisma.$transaction.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (tx: any) => Promise<void>) => {
          const tx = {
            wallet: { update: jest.fn().mockResolvedValueOnce({ balance: new Prisma.Decimal("150") }) },
            walletTransaction: { create: jest.fn() },
          };
          return fn(tx);
        },
      );

      await expect(
        service.creditFcoin(
          "user_001",
          "wallet_001",
          "order_001",
          new Prisma.Decimal("50"),
        ),
      ).resolves.not.toThrow();
    });
  });
});

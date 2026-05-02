import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { EmulatorService } from "./emulator.service.js";
import { EmulatorGateway } from "./emulator.gateway.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { PackageService } from "../package/package.service.js";

// ─── Mock Stripe ─────────────���───────────────────────────────��───────────────
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  }));
});

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeEmulator(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "emu-1",
    userId: "user-1",
    packageId: "pkg-1",
    orderId: "order-1",
    containerId: "container-abc",
    hostNode: "default",
    adbPort: 5555,
    websocketPath: "/ws/emu-1",
    internalIp: null,
    status: "provisioning",
    failureReason: null,
    metadata: null,
    expiresAt: new Date("2099-01-01"),
    lastHeartbeatAt: null,
    startedAt: null,
    stoppedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    package: {
      code: "SFAST",
      nameKey: "package.sfast.name",
      androidVersion: "10",
      cpuCores: 3,
      ramMb: 3072,
      romGb: 30,
    },
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-1",
    orderNumber: "ORD-001",
    userId: "user-1",
    type: "emulator_purchase",
    packageId: "pkg-1",
    status: "paid",
    billingDays: 30,
    currency: "THB",
    subtotal: "300.00",
    discount: "0.00",
    total: "300.00",
    paymentMethod: "fcoin",
    package: {
      id: "pkg-1",
      code: "SFAST",
    },
    ...overrides,
  };
}

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse["config"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EmulatorService", () => {
  let service: EmulatorService;
  let prisma: jest.Mocked<PrismaService>;
  let httpService: jest.Mocked<HttpService>;
  let gateway: jest.Mocked<EmulatorGateway>;

  beforeEach(async () => {
    const prismaMock = {
      emulator: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const httpMock = {
      post: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    const gatewayMock = {
      emitStatusUpdate: jest.fn(),
      emitExpiring: jest.fn(),
    } as unknown as jest.Mocked<EmulatorGateway>;

    const configMock = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          ORCHESTRATOR_URL: "http://orch:5000",
          ORCHESTRATOR_TOKEN: "test-token",
          WEBSOCKET_BASE_URL: "ws://localhost:8000",
        };
        return map[key] ?? undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const walletServiceMock = {
      deductFcoin: jest.fn(),
      getOrCreateWallet: jest.fn(),
    } as unknown as jest.Mocked<WalletService>;

    const packageServiceMock = {
      getPackageByCode: jest.fn(),
    } as unknown as jest.Mocked<PackageService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmulatorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: HttpService, useValue: httpMock },
        { provide: ConfigService, useValue: configMock },
        { provide: EmulatorGateway, useValue: gatewayMock },
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PackageService, useValue: packageServiceMock },
      ],
    }).compile();

    service = module.get<EmulatorService>(EmulatorService);
    prisma = module.get(PrismaService);
    httpService = module.get(HttpService);
    gateway = module.get(EmulatorGateway);
  });

  // ─── listEmulators ──────────────────────────────────────────────────────────

  describe("listEmulators", () => {
    it("should return mapped emulators for userId", async () => {
      const emulators = [makeEmulator(), makeEmulator({ id: "emu-2" })];
      (prisma.emulator.findMany as jest.Mock).mockResolvedValue(emulators);

      const result = await service.listEmulators("user-1");

      expect(prisma.emulator.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { package: true },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("emu-1");
      expect(result[0].packageCode).toBe("SFAST");
      expect(result[0].package.code).toBe("SFAST");
      expect(result[0].websocketUrl).toBe("ws://localhost:8000/ws/emu-1");
    });

    it("should return empty array when no emulators", async () => {
      (prisma.emulator.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.listEmulators("user-1");
      expect(result).toEqual([]);
    });
  });

  // ─── getEmulator ────────────────────────────────────────────────────────────

  describe("getEmulator", () => {
    it("should return emulator with websocketUrl and package fields", async () => {
      const emulator = makeEmulator();
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(emulator);

      const result = await service.getEmulator("user-1", "emu-1");

      expect(result.id).toBe("emu-1");
      expect(result.websocketUrl).toBe("ws://localhost:8000/ws/emu-1");
      expect(result.packageCode).toBe("SFAST");
      expect(result.package.cpuCores).toBe(3);
      expect(result.failureReasonKey).toBeNull();
    });

    it("should throw NotFoundException when emulator not found", async () => {
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getEmulator("user-1", "emu-xxx")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createEmulator ─────────────────────────────────────────────────────────

  describe("createEmulator", () => {
    it("should create emulator and call orchestrator", async () => {
      const order = makeOrder();
      const newEmulator = makeEmulator();

      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(null);
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          axiosResponse({
            containerId: "container-abc",
            containerName: "emulfast-emu-1",
            adbPort: 5555,
            websocketPath: "/ws/emu-1",
          }),
        ),
      );
      (prisma.emulator.create as jest.Mock).mockResolvedValue(newEmulator);
      (prisma.emulator.findUniqueOrThrow as jest.Mock).mockResolvedValue(newEmulator);

      const result = await service.createEmulator("user-1", "order-1");

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: "order-1", userId: "user-1", status: "paid" },
        include: { package: true },
      });
      expect(httpService.post).toHaveBeenCalledWith(
        "http://orch:5000/containers",
        expect.objectContaining({
          userId: "user-1",
          packageCode: "SFAST",
        }),
        expect.objectContaining({
          headers: { Authorization: "Bearer test-token" },
        }),
      );
      expect(prisma.emulator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            orderId: "order-1",
            containerId: "container-abc",
            adbPort: 5555,
            status: "provisioning",
          }),
        }),
      );
      expect(prisma.emulator.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: newEmulator.id },
        include: { package: true },
      });
      expect(result.id).toBe("emu-1");
      expect(result.packageCode).toBe("SFAST");
    });

    it("should throw NotFoundException when order not found", async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createEmulator("user-1", "order-xxx"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when emulator already exists for order", async () => {
      const order = makeOrder();
      const existing = makeEmulator();

      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(existing);

      await expect(
        service.createEmulator("user-1", "order-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw InternalServerErrorException when orchestrator fails", async () => {
      const order = makeOrder();

      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(null);
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => Object.assign(new Error("connection refused"), { response: undefined })),
      );

      await expect(
        service.createEmulator("user-1", "order-1"),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ─── deleteEmulator ─────────────────────────────────────────────────────────

  describe("deleteEmulator", () => {
    it("should terminate emulator and call orchestrator DELETE", async () => {
      const emulator = makeEmulator();
      const updated = makeEmulator({ status: "terminated", stoppedAt: new Date(), deletedAt: new Date() });

      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(emulator);
      (httpService.delete as jest.Mock).mockReturnValue(
        of(axiosResponse({ ok: true })),
      );
      (prisma.emulator.update as jest.Mock).mockResolvedValue(updated);
      (prisma.emulator.findUniqueOrThrow as jest.Mock).mockResolvedValue(updated);

      const result = await service.deleteEmulator("user-1", "emu-1");

      expect(httpService.delete).toHaveBeenCalledWith(
        "http://orch:5000/containers/container-abc",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-token" },
        }),
      );
      expect(prisma.emulator.update).toHaveBeenCalledWith({
        where: { id: "emu-1" },
        data: expect.objectContaining({
          status: "terminated",
        }),
      });
      expect(gateway.emitStatusUpdate).toHaveBeenCalledWith(
        "user-1",
        "emu-1",
        "stopped",
        updated.expiresAt,
      );
      expect(result.status).toBe("terminated");
      expect(result.packageCode).toBe("SFAST");
    });

    it("should throw NotFoundException when emulator not found", async () => {
      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteEmulator("user-1", "emu-xxx"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should still delete DB record even if orchestrator returns 404", async () => {
      const emulator = makeEmulator();
      const updated = makeEmulator({ status: "terminated" });
      const notFoundErr = Object.assign(new Error("Not found"), {
        response: { status: 404 },
      });

      (prisma.emulator.findFirst as jest.Mock).mockResolvedValue(emulator);
      (httpService.delete as jest.Mock).mockReturnValue(
        throwError(() => notFoundErr),
      );
      (prisma.emulator.update as jest.Mock).mockResolvedValue(updated);
      (prisma.emulator.findUniqueOrThrow as jest.Mock).mockResolvedValue(updated);

      // ต้องไม่ throw
      await expect(
        service.deleteEmulator("user-1", "emu-1"),
      ).resolves.toBeDefined();
    });
  });

  // ─── mapToResponse ───────────────────────────────────────────────────────────

  describe("mapToResponse", () => {
    it("should build websocketUrl from wsBaseUrl + websocketPath", () => {
      const emulator = makeEmulator({ websocketPath: "/ws/test" });
      const result = service.mapToResponse(emulator as Parameters<typeof service.mapToResponse>[0], "ws://custom:9000");
      expect(result.websocketUrl).toBe("ws://custom:9000/ws/test");
    });

    it("should return null websocketUrl when websocketPath is null", () => {
      const emulator = makeEmulator({ websocketPath: null });
      const result = service.mapToResponse(emulator as Parameters<typeof service.mapToResponse>[0]);
      expect(result.websocketUrl).toBeNull();
    });

    it("should map failureReason to failureReasonKey", () => {
      const emulator = makeEmulator({ failureReason: "errors.emulator.provision_failed" });
      const result = service.mapToResponse(emulator as Parameters<typeof service.mapToResponse>[0]);
      expect(result.failureReasonKey).toBe("errors.emulator.provision_failed");
    });

    it("should include packageCode and package object", () => {
      const emulator = makeEmulator();
      const result = service.mapToResponse(emulator as Parameters<typeof service.mapToResponse>[0]);
      expect(result.packageCode).toBe("SFAST");
      expect(result.package).toEqual({
        code: "SFAST",
        nameKey: "package.sfast.name",
        androidVersion: "10",
        cpuCores: 3,
        ramMb: 3072,
        romGb: 30,
      });
    });
  });
});

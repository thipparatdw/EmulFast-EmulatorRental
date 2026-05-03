import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@emulfast/db";
import { PackageService } from "./package.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makePackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pkg-1",
    code: "SFAST",
    nameKey: "package.sfast.name",
    descriptionKey: "package.sfast.description",
    androidVersion: "10",
    cpuCores: 3,
    ramMb: 3072,
    romGb: 30,
    pricePerDay: new Prisma.Decimal("10.00"),
    pricePerMonth: new Prisma.Decimal("270.00"),
    fcoinPerDay: new Prisma.Decimal("1000.0000"),
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PackageService", () => {
  let service: PackageService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const prismaMock = {
      package: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackageService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PackageService>(PackageService);
    prisma = module.get(PrismaService);
  });

  // ─── listPackages ────────────────────────────────────────────────────────────

  describe("listPackages", () => {
    it("should return mapped packages ordered by sortOrder", async () => {
      const sfastPkg = makePackage();
      const mfastPkg = makePackage({
        id: "pkg-2",
        code: "MFAST",
        nameKey: "package.mfast.name",
        descriptionKey: null,
        androidVersion: "12",
        cpuCores: 3,
        ramMb: 4096,
        romGb: 64,
        pricePerDay: new Prisma.Decimal("15.00"),
        pricePerMonth: new Prisma.Decimal("400.00"),
        fcoinPerDay: new Prisma.Decimal("1500.0000"),
        sortOrder: 1,
      });

      (prisma.package.findMany as jest.Mock).mockResolvedValue([
        sfastPkg,
        mfastPkg,
      ]);

      const result = await service.listPackages();

      expect(prisma.package.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      expect(result).toHaveLength(2);
    });

    it("should map Decimal fields to string", async () => {
      (prisma.package.findMany as jest.Mock).mockResolvedValue([makePackage()]);

      const result = await service.listPackages();

      expect(typeof result[0].pricePerDay).toBe("string");
      expect(typeof result[0].pricePerMonth).toBe("string");
      expect(typeof result[0].fcoinPerDay).toBe("string");
      // Prisma.Decimal.toString() strips trailing zeros
      expect(result[0].pricePerDay).toBe(new Prisma.Decimal("10.00").toString());
      expect(result[0].pricePerMonth).toBe(new Prisma.Decimal("270.00").toString());
      expect(result[0].fcoinPerDay).toBe(new Prisma.Decimal("1000.0000").toString());
    });

    it("should map all fields correctly", async () => {
      (prisma.package.findMany as jest.Mock).mockResolvedValue([makePackage()]);

      const result = await service.listPackages();
      const pkg = result[0];

      expect(pkg.id).toBe("pkg-1");
      expect(pkg.code).toBe("SFAST");
      expect(pkg.nameKey).toBe("package.sfast.name");
      expect(pkg.descriptionKey).toBe("package.sfast.description");
      expect(pkg.androidVersion).toBe("10");
      expect(pkg.cpuCores).toBe(3);
      expect(pkg.ramMb).toBe(3072);
      expect(pkg.romGb).toBe(30);
      expect(pkg.isActive).toBe(true);
      expect(pkg.sortOrder).toBe(0);
      expect(pkg.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(pkg.updatedAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should return empty array when no active packages", async () => {
      (prisma.package.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listPackages();

      expect(result).toEqual([]);
    });

    it("should map descriptionKey as null when not set", async () => {
      (prisma.package.findMany as jest.Mock).mockResolvedValue([
        makePackage({ descriptionKey: null }),
      ]);

      const result = await service.listPackages();

      expect(result[0].descriptionKey).toBeNull();
    });
  });

  // ─── getPackageByCode ─────────────────────────────────────────────────────────

  describe("getPackageByCode", () => {
    it("should return mapped package when found", async () => {
      const pkg = makePackage();
      (prisma.package.findFirst as jest.Mock).mockResolvedValue(pkg);

      const result = await service.getPackageByCode("SFAST");

      expect(prisma.package.findFirst).toHaveBeenCalledWith({
        where: { code: "SFAST", isActive: true },
      });
      expect(result.id).toBe("pkg-1");
      expect(result.code).toBe("SFAST");
      expect(result.pricePerDay).toBe(new Prisma.Decimal("10.00").toString());
    });

    it("should map Decimal fields to string on found package", async () => {
      const pkg = makePackage({
        pricePerDay: new Prisma.Decimal("10.50"),
        pricePerMonth: new Prisma.Decimal("285.00"),
        fcoinPerDay: new Prisma.Decimal("1050.0000"),
      });
      (prisma.package.findFirst as jest.Mock).mockResolvedValue(pkg);

      const result = await service.getPackageByCode("SFAST");

      expect(typeof result.pricePerDay).toBe("string");
      // Prisma.Decimal.toString() strips trailing zeros
      expect(result.pricePerDay).toBe(new Prisma.Decimal("10.50").toString());
      expect(result.pricePerMonth).toBe(new Prisma.Decimal("285.00").toString());
      expect(result.fcoinPerDay).toBe(new Prisma.Decimal("1050.0000").toString());
    });

    it("should throw NotFoundException when package not found", async () => {
      (prisma.package.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getPackageByCode("UNKNOWN")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException with correct error shape", async () => {
      (prisma.package.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getPackageByCode("UNKNOWN")).rejects.toMatchObject({
        response: {
          error: {
            code: "NOT_FOUND",
            messageKey: "errors.package.not_found",
          },
        },
      });
    });
  });
});

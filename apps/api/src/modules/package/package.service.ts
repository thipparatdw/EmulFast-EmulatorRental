import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { Package } from "@emulfast/db";

// ─── Response type ────────────────────────────────────────────────────────────

export interface PackageResponse {
  id: string;
  code: string;
  nameKey: string;
  descriptionKey: string | null;
  androidVersion: string;
  cpuCores: number;
  ramMb: number;
  romGb: number;
  pricePerDay: string;
  pricePerMonth: string;
  fcoinPerDay: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PackageService {
  private readonly logger = new Logger(PackageService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapToResponse(pkg: Package): PackageResponse {
    return {
      id: pkg.id,
      code: pkg.code,
      nameKey: pkg.nameKey,
      descriptionKey: pkg.descriptionKey ?? null,
      androidVersion: pkg.androidVersion,
      cpuCores: pkg.cpuCores,
      ramMb: pkg.ramMb,
      romGb: pkg.romGb,
      pricePerDay: pkg.pricePerDay.toString(),
      pricePerMonth: pkg.pricePerMonth.toString(),
      fcoinPerDay: pkg.fcoinPerDay.toString(),
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      createdAt: pkg.createdAt.toISOString(),
      updatedAt: pkg.updatedAt.toISOString(),
    };
  }

  async listPackages(): Promise<PackageResponse[]> {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return packages.map((p) => this.mapToResponse(p));
  }

  async getPackageByCode(code: string): Promise<PackageResponse> {
    const pkg = await this.prisma.package.findFirst({
      where: { code, isActive: true },
    });

    if (!pkg) {
      this.logger.warn(`Package not found: code=${code}`);
      throw new NotFoundException({
        error: {
          code: "NOT_FOUND",
          message: `Package '${code}' not found`,
          messageKey: "errors.package.not_found",
        },
      });
    }

    return this.mapToResponse(pkg);
  }
}

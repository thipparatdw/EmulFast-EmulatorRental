import { Controller, Get, Param, Logger } from "@nestjs/common";
import { ok } from "../../common/response.js";
import { PackageService } from "./package.service.js";

@Controller("packages")
export class PackageController {
  private readonly logger = new Logger(PackageController.name);

  constructor(private readonly packageService: PackageService) {}

  /**
   * GET /api/packages
   * List packages ที่ active ทั้งหมด (public endpoint)
   */
  @Get()
  async listPackages() {
    const packages = await this.packageService.listPackages();
    return ok({ packages });
  }

  /**
   * GET /api/packages/:code
   * ดึง package เดียวตาม code เช่น SFAST, MFAST (public endpoint)
   */
  @Get(":code")
  async getPackage(@Param("code") code: string) {
    const upperCode = code.toUpperCase();
    this.logger.log(`Get package: code=${upperCode}`);
    const pkg = await this.packageService.getPackageByCode(upperCode);
    return ok({ package: pkg });
  }
}

import { Module } from "@nestjs/common";
import { PackageController } from "./package.controller.js";
import { PackageService } from "./package.service.js";

@Module({
  controllers: [PackageController],
  providers: [PackageService],
  exports: [PackageService],
})
export class PackageModule {}

import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { HttpModule } from "@nestjs/axios";
import { AuthModule } from "../auth/auth.module.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { PackageModule } from "../package/package.module.js";
import { EmulatorController } from "./emulator.controller.js";
import { EmulatorService } from "./emulator.service.js";
import { EmulatorGateway } from "./emulator.gateway.js";
import { EmulatorExpiryProcessor } from "./emulator-expiry.processor.js";

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: "emulator-expiry" }),
    // Import AuthModule เพื่อใช้ JwtService ใน gateway
    AuthModule,
    // WalletModule + PackageModule สำหรับ renew flow (Phase 2)
    WalletModule,
    PackageModule,
  ],
  controllers: [EmulatorController],
  providers: [EmulatorService, EmulatorGateway, EmulatorExpiryProcessor],
  exports: [EmulatorService],
})
export class EmulatorModule {}

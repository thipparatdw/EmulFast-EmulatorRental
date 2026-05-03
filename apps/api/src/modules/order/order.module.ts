import { Module } from "@nestjs/common";
import { OrderController } from "./order.controller.js";
import { OrderService } from "./order.service.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { PackageModule } from "../package/package.module.js";

@Module({
  imports: [WalletModule, PackageModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

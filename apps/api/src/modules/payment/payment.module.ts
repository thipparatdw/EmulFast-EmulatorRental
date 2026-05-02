import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { OrderModule } from "../order/order.module.js";
import { EmulatorModule } from "../emulator/emulator.module.js";

@Module({
  imports: [WalletModule, OrderModule, EmulatorModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

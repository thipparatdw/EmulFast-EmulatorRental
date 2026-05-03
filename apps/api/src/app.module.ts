import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EmulatorModule } from "./modules/emulator/emulator.module.js";
import { PackageModule } from "./modules/package/package.module.js";
import { WalletModule } from "./modules/wallet/wallet.module.js";
import { OrderModule } from "./modules/order/order.module.js";
import { PaymentModule } from "./modules/payment/payment.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { AppController } from "./app.controller.js";

@Module({
  imports: [
    // Config — global, loads .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Prisma — global (exported from PrismaModule)
    PrismaModule,

    // Rate limiting — Redis store จะเพิ่มตอน Phase 7
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // BullMQ — global connection (Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const raw = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
        const parsed = new URL(raw);
        return {
          connection: {
            host: parsed.hostname,
            port: parseInt(parsed.port || "6379", 10),
            ...(parsed.password ? { password: parsed.password } : {}),
          },
        };
      },
    }),

    // Auth (register, login, refresh, logout, me)
    AuthModule,

    // Emulator (Phase 1 + Phase 2 renew)
    EmulatorModule,

    // Package (Phase 2)
    PackageModule,

    // Wallet — Fcoin balance + topup (Phase 2)
    WalletModule,

    // Order — purchase + renewal (Phase 2)
    OrderModule,

    // Payment — Stripe webhook handler (Phase 2)
    PaymentModule,

    // Users — profile, update, change password (Phase 3)
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtStrategy } from "./strategies/jwt.strategy.js";
import { JwtRefreshStrategy } from "./strategies/jwt-refresh.strategy.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, JwtRefreshGuard, RolesGuard, JwtModule],
})
export class AuthModule {}

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../auth/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { ok } from "../../common/response.js";
import { EmulatorService } from "./emulator.service.js";
import {
  CreateEmulatorSchema,
  type CreateEmulatorDto,
} from "./dto/create-emulator.dto.js";
import {
  RenewEmulatorSchema,
  type RenewEmulatorDto,
} from "./dto/renew-emulator.dto.js";

@Controller("emulators")
@UseGuards(JwtAuthGuard)
export class EmulatorController {
  private readonly logger = new Logger(EmulatorController.name);

  constructor(private readonly emulatorService: EmulatorService) {}

  /**
   * GET /api/emulators
   * List emulators ของ user ที่ login อยู่
   */
  @Get()
  async listEmulators(@CurrentUser() user: JwtPayload) {
    const emulators = await this.emulatorService.listEmulators(user.sub);
    return ok({ emulators });
  }

  /**
   * GET /api/emulators/:id
   * ดึง emulator เดียวพร้อม websocketUrl
   */
  @Get(":id")
  async getEmulator(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    const emulator = await this.emulatorService.getEmulator(user.sub, id);
    return ok({ emulator });
  }

  /**
   * POST /api/emulators
   * สร้าง emulator จาก paid order
   * Body: { orderId: string }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEmulator(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateEmulatorSchema)) body: CreateEmulatorDto,
  ) {
    this.logger.log(
      `Create emulator: user=${user.sub} orderId=${body.orderId}`,
    );
    const emulator = await this.emulatorService.createEmulator(
      user.sub,
      body.orderId,
    );
    return ok({ emulator });
  }

  /**
   * POST /api/emulators/:id/renew
   * ต่ออายุ emulator — ไม่ restart container แค่ขยาย expiresAt
   * Body: { packageCode, paymentMethod, billingDays? }
   * - fcoin → extend ทันที
   * - card  → return checkoutUrl
   */
  @Post(":id/renew")
  @HttpCode(HttpStatus.CREATED)
  async renewEmulator(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RenewEmulatorSchema)) body: RenewEmulatorDto,
  ) {
    this.logger.log(
      `Renew emulator: user=${user.sub} id=${id} method=${body.paymentMethod}`,
    );
    const result = await this.emulatorService.renewEmulator(
      user.sub,
      id,
      body,
    );
    return ok(result);
  }

  /**
   * DELETE /api/emulators/:id
   * ลบ emulator + terminate container
   */
  @Delete(":id")
  async deleteEmulator(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    this.logger.log(`Delete emulator: user=${user.sub} id=${id}`);
    const emulator = await this.emulatorService.deleteEmulator(user.sub, id);
    return ok({ emulator });
  }
}

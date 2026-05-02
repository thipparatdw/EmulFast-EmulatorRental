import {
  Controller,
  Get,
  Post,
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
import { OrderService } from "./order.service.js";
import { CreateOrderInputSchema, type CreateOrderInput } from "@emulfast/shared";

@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  /**
   * GET /api/orders
   * List orders ของ user
   */
  @Get()
  async listOrders(@CurrentUser() user: JwtPayload) {
    const orders = await this.orderService.listOrders(user.sub);
    return ok({ orders });
  }

  /**
   * GET /api/orders/:id
   * ดึง order เดียว
   */
  @Get(":id")
  async getOrder(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    const order = await this.orderService.getOrder(user.sub, id);
    return ok({ order });
  }

  /**
   * GET /api/orders/:id/status
   * Poll order status (สำหรับ frontend หลัง stripe redirect)
   */
  @Get(":id/status")
  async getOrderStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    const status = await this.orderService.getOrderStatus(user.sub, id);
    return ok(status);
  }

  /**
   * POST /api/orders
   * สร้าง order ใหม่
   * Body: { packageCode, paymentMethod, billingDays? }
   * - card   → return { order, checkoutUrl }
   * - fcoin  → return { order, checkoutUrl: null }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateOrderInputSchema)) body: CreateOrderInput,
  ) {
    this.logger.log(
      `Create order: user=${user.sub} pkg=${body.packageCode} method=${body.paymentMethod} days=${body.billingDays}`,
    );
    const result = await this.orderService.createOrder(user.sub, body);
    return ok(result);
  }
}

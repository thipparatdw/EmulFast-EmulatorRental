import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, moneyThbSchema } from "./common.js";
import { PackageCodeSchema } from "./package.schema.js";

export const OrderTypeSchema = z.enum([
  "emulator_purchase",
  "emulator_renewal",
  "wallet_topup",
]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderStatusSchema = z.enum([
  "pending",
  "awaiting_payment",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentMethodSchema = z.enum(["card", "fcoin"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const OrderResponseSchema = z.object({
  id: cuidSchema,
  orderNumber: z.string(),
  userId: cuidSchema,
  type: OrderTypeSchema,
  packageCode: PackageCodeSchema.nullable(), // null สำหรับ wallet_topup
  paymentMethod: PaymentMethodSchema,
  status: OrderStatusSchema,
  billingDays: z.number().int().positive().nullable(),
  subtotal: moneyThbSchema,
  discount: moneyThbSchema,
  total: moneyThbSchema,
  currency: z.string().default("THB"),
  stripeCheckoutUrl: z.string().url().nullable(), // เฉพาะ card payment ที่ pending
  stripeSessionId: z.string().nullable(),
  emulatorId: cuidSchema.nullable(), // set หลัง emulator ถูก create
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

export const OrderListResponseSchema = z.array(OrderResponseSchema);
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

// Input schemas
export const CreateOrderInputSchema = z.object({
  packageCode: PackageCodeSchema,
  paymentMethod: PaymentMethodSchema,
  billingDays: z.number().int().positive().default(30),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

export const OrderStatusResponseSchema = z.object({
  orderId: cuidSchema,
  status: OrderStatusSchema,
  emulatorId: cuidSchema.nullable(),
  checkoutUrl: z.string().url().nullable(),
});
export type OrderStatusResponse = z.infer<typeof OrderStatusResponseSchema>;

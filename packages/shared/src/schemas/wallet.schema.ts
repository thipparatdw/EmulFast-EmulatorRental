import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, moneyFcoinSchema } from "./common.js";

export const WalletTxTypeSchema = z.enum([
  "topup",
  "spend",
  "refund",
  "reward",
  "promo_credit",
  "adjustment",
]);
export type WalletTxType = z.infer<typeof WalletTxTypeSchema>;

export const WalletTransactionSchema = z.object({
  id: cuidSchema,
  type: WalletTxTypeSchema,
  amount: moneyFcoinSchema, // บวกเสมอ (direction จาก type)
  balanceAfter: moneyFcoinSchema,
  descriptionKey: z.string(), // i18n key เช่น "wallet.tx.topup"
  orderId: cuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export const WalletResponseSchema = z.object({
  balance: moneyFcoinSchema,
  transactions: z.array(WalletTransactionSchema),
});
export type WalletResponse = z.infer<typeof WalletResponseSchema>;

export const TopupInputSchema = z.object({
  amountThb: z.number().int().min(10).max(10000), // 10–10,000 THB
});
export type TopupInput = z.infer<typeof TopupInputSchema>;

export const TopupResponseSchema = z.object({
  orderId: cuidSchema,
  checkoutUrl: z.string().url(), // Stripe Checkout redirect URL
});
export type TopupResponse = z.infer<typeof TopupResponseSchema>;

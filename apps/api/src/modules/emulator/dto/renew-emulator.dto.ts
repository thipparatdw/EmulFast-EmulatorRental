import { z } from "zod";
import { PackageCodeSchema, PaymentMethodSchema } from "@emulfast/shared";

export const RenewEmulatorSchema = z.object({
  packageCode: PackageCodeSchema,
  paymentMethod: PaymentMethodSchema,
  billingDays: z.number().int().positive().default(30),
});

export type RenewEmulatorDto = z.infer<typeof RenewEmulatorSchema>;

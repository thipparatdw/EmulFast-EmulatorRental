import { z } from "zod";

export const CreateEmulatorSchema = z.object({
  orderId: z.string().min(1, "orderId is required"),
});

export type CreateEmulatorDto = z.infer<typeof CreateEmulatorSchema>;

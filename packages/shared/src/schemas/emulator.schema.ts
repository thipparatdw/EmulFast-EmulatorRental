import { z } from "zod";
import { cuidSchema, isoDateTimeSchema } from "./common.js";
import { PackageCodeSchema, PackageSchema } from "./package.schema.js";

export const EmulatorStatusSchema = z.enum([
  "provisioning",
  "running",
  "stopping",
  "stopped",
  "expired",
  "failed",
  "terminated",
]);
export type EmulatorStatus = z.infer<typeof EmulatorStatusSchema>;

export const EmulatorResponseSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  packageCode: PackageCodeSchema,
  package: PackageSchema.pick({
    code: true,
    nameKey: true,
    androidVersion: true,
    cpuCores: true,
    ramMb: true,
    romGb: true,
  }),
  status: EmulatorStatusSchema,
  failureReasonKey: z.string().nullable(),
  websocketUrl: z.string().url().nullable(),
  hostNode: z.string(),
  expiresAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  stoppedAt: isoDateTimeSchema.nullable(),
  lastHeartbeatAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type EmulatorResponse = z.infer<typeof EmulatorResponseSchema>;

export const EmulatorListResponseSchema = z.array(EmulatorResponseSchema);
export type EmulatorListResponse = z.infer<typeof EmulatorListResponseSchema>;

export const CreateEmulatorInputSchema = z.object({
  orderId: cuidSchema,
});
export type CreateEmulatorInput = z.infer<typeof CreateEmulatorInputSchema>;

import { z } from "zod";
import {
  cuidSchema,
  isoDateTimeSchema,
  moneyThbSchema,
  moneyFcoinSchema,
} from "./common.js";

export const PackageCodeSchema = z.enum(["SFAST", "MFAST"]);
export type PackageCode = z.infer<typeof PackageCodeSchema>;

export const PackageSchema = z.object({
  id: cuidSchema,
  code: PackageCodeSchema,
  nameKey: z.string(),
  descriptionKey: z.string().nullable(),
  androidVersion: z.string(),
  cpuCores: z.number().int().positive(),
  ramMb: z.number().int().positive(),
  romGb: z.number().int().positive(),
  pricePerDay: moneyThbSchema,
  pricePerMonth: moneyThbSchema,
  fcoinPerDay: moneyFcoinSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Package = z.infer<typeof PackageSchema>;

export const PackageListResponseSchema = z.array(PackageSchema);
export type PackageListResponse = z.infer<typeof PackageListResponseSchema>;

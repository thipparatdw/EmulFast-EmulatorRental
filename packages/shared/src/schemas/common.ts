import { z } from "zod";

export const cuidSchema = z.string().cuid();
export const isoDateTimeSchema = z.string().datetime();
export const localeSchema = z.enum(["th", "en"]);

// Money เป็น string ใน wire format (Prisma Decimal serialize → string)
export const moneyThbSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);
export const moneyFcoinSchema = z.string().regex(/^\d+(\.\d{1,4})?$/);

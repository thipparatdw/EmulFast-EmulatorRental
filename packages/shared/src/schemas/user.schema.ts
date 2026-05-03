import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, moneyFcoinSchema } from "./common.js";

// ─── Update Profile ────────────────────────────────────────────────────────────

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(2).max(64).trim().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/, { message: "errors.user.phone_invalid" })
    .optional()
    .nullable(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

// ─── Change Password ───────────────────────────────────────────────────────────

export const ChangePasswordInputSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, { message: "errors.password.uppercase" })
    .regex(/[a-z]/, { message: "errors.password.lowercase" })
    .regex(/[0-9]/, { message: "errors.password.digit" }),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

// ─── Profile Response (extended UserResponse with wallet + membership) ─────────

export const MembershipSummarySchema = z.object({
  tierCode: z.enum(["bronze", "silver", "gold", "platinum"]).nullable(),
  points: z.number().int().nonnegative(),
  nextTierCode: z.enum(["bronze", "silver", "gold", "platinum"]).nullable(),
  pointsToNextTier: z.number().int().nonnegative().nullable(),
});
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const WalletSummarySchema = z.object({
  balance: moneyFcoinSchema,
  walletId: cuidSchema,
});
export type WalletSummary = z.infer<typeof WalletSummarySchema>;

export const UserProfileResponseSchema = z.object({
  id: cuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  role: z.enum(["user", "staff", "admin"]),
  status: z.enum(["active", "suspended", "banned"]),
  locale: z.enum(["th", "en"]),
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  membershipTierCode: z.enum(["bronze", "silver", "gold", "platinum"]).nullable(),
  membershipPoints: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  membership: MembershipSummarySchema.nullable(),
  wallet: WalletSummarySchema.nullable(),
});
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;

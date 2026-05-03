import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, localeSchema } from "./common.js";

export const RoleSchema = z.enum(["user", "staff", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

export const UserStatusSchema = z.enum(["active", "suspended", "banned"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RegisterInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, { message: "errors.password.uppercase" })
    .regex(/[a-z]/, { message: "errors.password.lowercase" })
    .regex(/[0-9]/, { message: "errors.password.digit" }),
  displayName: z.string().min(2).max(64).trim(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/)
    .optional(),
  locale: localeSchema.optional().default("th"),
  acceptTerms: z.literal(true),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const UserResponseSchema = z.object({
  id: cuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
  locale: localeSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  membershipTierCode: z
    .enum(["bronze", "silver", "gold", "platinum"])
    .nullable(),
  membershipPoints: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const AuthTokenResponseSchema = z.object({
  user: UserResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  accessTokenExpiresAt: isoDateTimeSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

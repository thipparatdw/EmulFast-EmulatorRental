# EmulFast — API Contract

> Single source of truth สำหรับ REST + WebSocket API. **เฉพาะ `architect` agent อัปเดต** (lead สั่ง). Backend + Frontend ต้อง match contract นี้ 100%

## Conventions

- **Base URL**: `/api`
- **Auth**: Bearer JWT ใน `Authorization` header **หรือ** `accessToken` cookie
- **Content-Type**: `application/json`
- **Locale**: header `Accept-Language: th | en`
- **Pagination**: query `?page=1&pageSize=20` (default 20, max 100)
- **Response wrapper**: ทุก endpoint ใช้ pattern เดียวกัน

```ts
// Success
{
  "data": <T>,
  "meta"?: { page, pageSize, total }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR" | "UNAUTHORIZED" | "NOT_FOUND" | ...,
    "message": "Human readable",      // English
    "messageKey": "errors.code.key",   // i18n key สำหรับ frontend
    "details"?: <object>
  }
}
```

## Error Codes (canonical)

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod schema fail |
| `UNAUTHORIZED` | 401 | missing/invalid token |
| `FORBIDDEN` | 403 | role not allowed |
| `NOT_FOUND` | 404 | resource not found |
| `CONFLICT` | 409 | duplicate (email, etc.) |
| `INSUFFICIENT_FUNDS` | 402 | wallet balance < required |
| `EMULATOR_LIMIT` | 429 | user reached max active emulators |
| `PAYMENT_FAILED` | 402 | gateway returned fail |
| `RATE_LIMIT` | 429 | too many requests |
| `INTERNAL` | 500 | uncaught |

## Endpoints (skeleton — architect จะ flesh out ใน Phase 0)

### Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | - | `{email, password, phone?, displayName}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/login` | - | `{email, password}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/refresh` | refresh cookie | - | `{accessToken}` |
| POST | `/auth/logout` | yes | - | `{ok: true}` |
| GET | `/auth/me` | yes | - | `{user}` |

### User & Profile

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/users/me` | yes | - | `{user, membership, wallet}` |
| PATCH | `/users/me` | yes | `{displayName?, phone?}` | `{user}` |
| POST | `/users/me/password` | yes | `{oldPassword, newPassword}` | `{ok}` |

### Packages

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/packages` | - | - | `Package[]` |
| GET | `/packages/:code` | - | - | `Package` |

### Emulators

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/emulators` | yes | - | `Emulator[]` (mine) |
| GET | `/emulators/:id` | yes | - | `Emulator` (with websocketUrl) |
| POST | `/emulators` | yes | `{orderId}` | `Emulator` (status=provisioning) |
| POST | `/emulators/:id/renew` | yes | `{packageCode, paymentMethod}` | `{order, emulator}` |
| DELETE | `/emulators/:id` | yes | - | `{ok}` |

### Orders & Payment

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/orders` | yes | `CreateOrderInput` | `{ order: OrderResponse, checkoutUrl?: string }` (checkoutUrl เฉพาะ card) |
| GET | `/orders` | yes | - | `OrderListResponse` |
| GET | `/orders/:id` | yes | - | `OrderResponse` |
| GET | `/orders/:id/status` | yes | - | `OrderStatusResponse` |
| POST | `/payments/stripe/webhook` | Stripe signature header | Stripe event payload | `{received: true}` |

> **Payment provider**: Demo ใช้ **Stripe Checkout Sessions** เท่านั้น (redirect flow). PromptPay/Omise ถูกเลื่อนไป post-demo — ดู ADR.

### Wallet (Fcoin)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/wallet` | yes | - | `WalletResponse` (balance + last 20 tx) |
| POST | `/wallet/topup` | yes | `TopupInput` `{amountThb}` | `TopupResponse` `{orderId, checkoutUrl}` |

## Stripe Checkout Session Flow

1. Client: `POST /orders { packageCode, paymentMethod: "card", billingDays }`
   - Server: create `Order` (status=`awaiting_payment`) + Stripe Checkout Session
   - Response: `{ order, checkoutUrl }`

2. Client: redirect browser to `checkoutUrl` (stripe.com hosted page)

3. User: ใส่บัตรบน Stripe-hosted page → Stripe redirect ไป `/payment/success?session_id=xxx` (frontend route)

4. Stripe → Server: `POST /payments/stripe/webhook` event `checkout.session.completed`
   - Server: verify signature (`STRIPE_WEBHOOK_SECRET`) → mark Order `paid`
   - Server: emit WS event ที่เกี่ยวข้อง (เช่น `emulator.status` เมื่อ provisioning เริ่ม)

5. Client: poll `GET /orders/:id/status` จนกระทั่ง `status=paid` → UI แสดงปุ่ม "สร้าง emulator" หรือ auto-trigger

> **Wallet top-up ใช้ flow เดียวกัน** แต่ `type=wallet_topup` → webhook เครดิต Fcoin เข้า wallet แทนการเปิด emulator

> **Idempotency**: webhook handler ต้อง dedupe ด้วย `event.id` (Stripe) — ป้องกัน double-credit หาก Stripe retry

### Promocodes

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/promocodes/validate` | yes | `{code, packageCode}` | `{discount, finalAmount}` |

### Membership & Rewards

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/membership` | yes | - | `{tier, points, perks, nextTier}` |
| GET | `/rewards` | yes | - | `Reward[]` |
| POST | `/rewards/:id/redeem` | yes | - | `{redemption}` |

### Support

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/support/tickets` | yes | - | `Ticket[]` (mine) |
| POST | `/support/tickets` | yes | `{subject, channel, initialMessage, imageIds?}` | `Ticket` |
| GET | `/support/tickets/:id/messages` | yes | - | `Message[]` |
| POST | `/support/tickets/:id/messages` | yes | `{content, imageIds?}` | `Message` |
| POST | `/support/tickets/:id/escalate` | yes | - | `Ticket` (channel=staff) |
| POST | `/support/upload` | yes | multipart | `{imageId, url}` |

### Admin (role: staff | admin)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/admin/dashboard` | staff+ | - | `{kpi, charts}` |
| GET | `/admin/users` | staff+ | - | `User[]` (paginated) |
| GET | `/admin/orders` | staff+ | - | `Order[]` (paginated) |
| GET | `/admin/emulators` | staff+ | - | `Emulator[]` (all hosts) |
| POST | `/admin/promocodes` | admin | `{...}` | `Promocode` |
| PATCH | `/admin/users/:id` | admin | `{role?, status?}` | `User` |
| GET | `/admin/reports/orders.csv` | staff+ | - | CSV stream |

## WebSocket Events

### Channel: `/ws/emulator` (per-user)

```
event: emulator.status
data: { emulatorId, status: 'provisioning'|'running'|'stopping'|'expired', expiresAt }

event: emulator.expiring
data: { emulatorId, minutesLeft }
```

### Channel: `/ws/scrcpy/:emulatorId` (proxied to ws-scrcpy)

WebSocket binary frames (H.264 + control protocol per ws-scrcpy spec)

### Channel: `/ws/support/:ticketId`

```
event: message
data: { messageId, senderType: 'user'|'bot'|'staff', content, imageUrl?, createdAt }

event: typing
data: { senderType }
```

## Schemas (zod — defined ใน `packages/shared/src/schemas/`)

> Phase 0 flesh-out (Auth + Package + Emulator). Phase ถัดไปจะเพิ่ม OrderSchemas, WalletSchemas, MembershipSchemas, SupportSchemas
>
> **Convention**: zod schema → infer TS type ผ่าน `z.infer<typeof X>`. Backend ใช้ผ่าน `ZodValidationPipe`; Frontend ใช้ผ่าน `react-hook-form` + `@hookform/resolvers/zod`

### Common Primitives

```ts
// packages/shared/src/schemas/common.ts
import { z } from "zod";

export const cuidSchema = z.string().cuid();
export const isoDateTimeSchema = z.string().datetime();          // ISO 8601 UTC
export const localeSchema = z.enum(["th", "en"]);
export const moneyThbSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);   // Decimal-as-string
export const moneyFcoinSchema = z.string().regex(/^\d+(\.\d{1,4})?$/);
```

> **Note**: Money เป็น `string` ใน wire format (เพราะ Prisma `Decimal` serialize เป็น string เพื่อกัน float precision loss). UI แปลงเป็น `Decimal.js` หรือ format ผ่าน `Intl.NumberFormat`

### AuthSchemas

```ts
// packages/shared/src/schemas/auth.ts
import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, localeSchema } from "./common";

export const RoleSchema = z.enum(["user", "staff", "admin"]);
export const UserStatusSchema = z.enum(["active", "suspended", "banned"]);

export const LoginInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RegisterInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, { message: "errors.password.uppercase" })
    .regex(/[a-z]/, { message: "errors.password.lowercase" })
    .regex(/[0-9]/, { message: "errors.password.digit" }),
  displayName: z.string().min(2).max(64).trim(),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
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
  membershipTierCode: z.enum(["bronze", "silver", "gold", "platinum"]).nullable(),
  membershipPoints: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const AuthTokenResponseSchema = z.object({
  user: UserResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),   // อาจ omit ถ้าใช้ httpOnly cookie
  accessTokenExpiresAt: isoDateTimeSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
```

### PackageSchemas

```ts
// packages/shared/src/schemas/package.ts
import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, moneyThbSchema, moneyFcoinSchema } from "./common";

export const PackageCodeSchema = z.enum(["SFAST", "MFAST"]);
export type PackageCode = z.infer<typeof PackageCodeSchema>;

export const PackageSchema = z.object({
  id: cuidSchema,
  code: PackageCodeSchema,
  nameKey: z.string(),               // i18n key
  descriptionKey: z.string().nullable(),
  androidVersion: z.string(),        // '10' | '12'
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
```

### EmulatorSchemas

```ts
// packages/shared/src/schemas/emulator.ts
import { z } from "zod";
import { cuidSchema, isoDateTimeSchema } from "./common";
import { PackageSchema, PackageCodeSchema } from "./package";

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
  failureReasonKey: z.string().nullable(),    // i18n key — server แปลง raw → key
  websocketUrl: z.string().url().nullable(),  // null ระหว่าง provisioning
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

// Phase 1 — placeholder (architect จะ flesh-out จริงตอน Phase 1)
export const CreateEmulatorInputSchema = z.object({
  orderId: cuidSchema,
});
export type CreateEmulatorInput = z.infer<typeof CreateEmulatorInputSchema>;
```

### OrderSchemas (Phase 2)

```ts
// packages/shared/src/schemas/order.schema.ts
import { z } from "zod";
import { cuidSchema, isoDateTimeSchema, moneyThbSchema } from "./common.js";
import { PackageCodeSchema } from "./package.schema.js";

export const OrderTypeSchema = z.enum([
  "emulator_purchase",
  "renewal",
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
  packageCode: PackageCodeSchema.nullable(),       // null สำหรับ wallet_topup
  paymentMethod: PaymentMethodSchema,
  status: OrderStatusSchema,
  billingDays: z.number().int().positive().nullable(),
  subtotal: moneyThbSchema,
  discount: moneyThbSchema,
  total: moneyThbSchema,
  currency: z.string().default("THB"),
  stripeCheckoutUrl: z.string().url().nullable(),  // เฉพาะ card payment ที่ pending
  stripeSessionId: z.string().nullable(),
  emulatorId: cuidSchema.nullable(),               // set หลัง emulator ถูก create
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

export const OrderListResponseSchema = z.array(OrderResponseSchema);

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
```

### WalletSchemas (Phase 2)

```ts
// packages/shared/src/schemas/wallet.schema.ts
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
  amount: moneyFcoinSchema,         // บวกเสมอ (direction จาก type)
  balanceAfter: moneyFcoinSchema,
  descriptionKey: z.string(),       // i18n key เช่น "wallet.tx.topup"
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
  amountThb: z.number().int().min(10).max(10000),  // 10–10,000 THB
});
export type TopupInput = z.infer<typeof TopupInputSchema>;

export const TopupResponseSchema = z.object({
  orderId: cuidSchema,
  checkoutUrl: z.string().url(),    // Stripe Checkout redirect URL
});
export type TopupResponse = z.infer<typeof TopupResponseSchema>;
```

### Phase ถัดไปจะเพิ่ม

- `MembershipSchemas`: `MembershipTier`, `Reward`, `RewardRedemption`
- `SupportSchemas`: `Ticket`, `Message`, `CreateTicketInput`, `TicketStatus`
- `PromocodeSchemas`: `PromocodeValidateInput`, `PromocodeValidateResponse`

## Versioning

Demo: ไม่มี versioning. ถ้ามี breaking change → architect เพิ่ม ADR + bump path เป็น `/api/v2/...`

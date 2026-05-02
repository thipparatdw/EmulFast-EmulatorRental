// ─── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = {
  USER: "user",
  STAFF: "staff",
  ADMIN: "admin",
} as const;

export type RoleValue = (typeof ROLES)[keyof typeof ROLES];

// ─── Emulator Status ─────────────────────────────────────────────────────────
export const EMULATOR_STATUS = {
  PROVISIONING: "provisioning",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  EXPIRED: "expired",
  FAILED: "failed",
  TERMINATED: "terminated",
} as const;

export type EmulatorStatusValue =
  (typeof EMULATOR_STATUS)[keyof typeof EMULATOR_STATUS];

// ─── Order Status ─────────────────────────────────────────────────────────────
export const ORDER_STATUS = {
  PENDING: "pending",
  AWAITING_PAYMENT: "awaiting_payment",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type OrderStatusValue =
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// ─── Payment Method ───────────────────────────────────────────────────────────
export const PAYMENT_METHOD = {
  CARD: "card",
  FCOIN: "fcoin",
} as const;

export type PaymentMethodValue =
  (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// ─── Payment Gateway ──────────────────────────────────────────────────────────
export const PAYMENT_GATEWAY = {
  STRIPE: "stripe",
  FCOIN: "fcoin",
  MANUAL: "manual",
} as const;

export type PaymentGatewayValue =
  (typeof PAYMENT_GATEWAY)[keyof typeof PAYMENT_GATEWAY];

// ─── Wallet Tx Type ───────────────────────────────────────────────────────────
export const WALLET_TX_TYPE = {
  TOPUP: "topup",
  SPEND: "spend",
  REFUND: "refund",
  REWARD: "reward",
  PROMO_CREDIT: "promo_credit",
  ADJUSTMENT: "adjustment",
} as const;

export type WalletTxTypeValue =
  (typeof WALLET_TX_TYPE)[keyof typeof WALLET_TX_TYPE];

// ─── Membership Tier ──────────────────────────────────────────────────────────
export const MEMBERSHIP_TIER = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
} as const;

export type MembershipTierValue =
  (typeof MEMBERSHIP_TIER)[keyof typeof MEMBERSHIP_TIER];

// ─── Ticket Status ────────────────────────────────────────────────────────────
export const TICKET_STATUS = {
  OPEN: "open",
  PENDING_USER: "pending_user",
  PENDING_STAFF: "pending_staff",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export type TicketStatusValue =
  (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

// ─── Package Codes ────────────────────────────────────────────────────────────
export const PACKAGE_CODE = {
  SFAST: "SFAST",
  MFAST: "MFAST",
} as const;

export type PackageCodeValue = (typeof PACKAGE_CODE)[keyof typeof PACKAGE_CODE];

// ─── Locale ───────────────────────────────────────────────────────────────────
export const LOCALE = {
  TH: "th",
  EN: "en",
} as const;

export type LocaleValue = (typeof LOCALE)[keyof typeof LOCALE];

// ─── Pagination Defaults ──────────────────────────────────────────────────────
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ─── Error Codes ──────────────────────────────────────────────────────────────
export const ERROR_CODE = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  EMULATOR_LIMIT: "EMULATOR_LIMIT",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  RATE_LIMIT: "RATE_LIMIT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCodeValue = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

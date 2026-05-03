// ─── Pagination Meta ──────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── API Response wrapper ─────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── API Error ────────────────────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string;
    message: string;
    messageKey: string;
    details?: unknown;
  };
}

// ─── Utility Types ────────────────────────────────────────────────────────────

/** Make specific keys required */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Make specific keys optional */
export type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Deep Readonly */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

/** Nullable — shorthand for T | null */
export type Nullable<T> = T | null;

/** Optional — shorthand for T | undefined */
export type Optional<T> = T | undefined;

/** ID type (cuid string) */
export type Id = string;

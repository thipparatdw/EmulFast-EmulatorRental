import { PaginationMeta } from "@emulfast/shared";

export interface OkResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

/**
 * Helper สร้าง success response ตาม API contract
 * `{ data: T, meta?: PaginationMeta }`
 */
export function ok<T>(data: T, meta?: PaginationMeta): OkResponse<T> {
  if (meta !== undefined) {
    return { data, meta };
  }
  return { data };
}

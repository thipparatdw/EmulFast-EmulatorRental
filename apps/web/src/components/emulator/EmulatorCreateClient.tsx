"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useLocale } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmulatorResponse {
  id: string;
  status: string;
}

interface ApiResponse<T> {
  data: T;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * หน้านี้รับ ?orderId=xxx แล้ว auto-call POST /emulators เพื่อสร้าง emulator
 * จาก paid order จากนั้น redirect ไปหน้า viewer
 */
export default function EmulatorCreateClient() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orderId || creating) return;

    async function createEmulator() {
      setCreating(true);
      try {
        const result = await apiFetch<ApiResponse<{ emulator: EmulatorResponse }>>(
          "/emulators",
          {
            method: "POST",
            body: JSON.stringify({ orderId }),
          },
        );
        const emulator = result.data?.emulator;
        if (emulator?.id) {
          router.replace(`/${locale}/emulators/${emulator.id}` as Route);
        } else {
          setError("ไม่สามารถสร้าง Emulator ได้");
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
        }
      }
    }

    void createEmulator();
  }, [orderId, locale, router, creating]);

  if (error) {
    return (
      <div className="max-w-md text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => router.push(`/${locale}/orders` as Route)}
          className="text-blue-600 hover:underline"
        >
          ดูคำสั่งซื้อ
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-600">กำลังสร้าง Emulator...</p>
    </div>
  );
}

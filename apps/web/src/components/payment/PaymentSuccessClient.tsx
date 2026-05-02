"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderStatusResponse {
  orderId: string;
  status: "pending" | "awaiting_payment" | "paid" | "failed" | "cancelled" | "refunded";
  emulatorId: string | null;
  checkoutUrl: string | null;
}

interface ApiResponse<T> {
  data: T;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentSuccessClient() {
  const t = useTranslations("payment");
  const tSuccess = useTranslations("payment.success");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // session_id จาก Stripe redirect หรือ orderId จาก Fcoin direct
  const sessionId = searchParams.get("session_id");
  const directOrderId = searchParams.get("orderId");

  const [status, setStatus] = useState<"polling" | "paid" | "failed">("polling");
  const [orderId, setOrderId] = useState<string | null>(directOrderId);
  const [orderType, setOrderType] = useState<"emulator" | "topup" | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // ─── ดึง orderId จาก session_id (Stripe redirect) ─────────────────────

  const resolveOrderId = useCallback(async () => {
    if (directOrderId) {
      // Fcoin payment — orderId มาตรง
      setOrderId(directOrderId);
      return;
    }

    if (!sessionId) {
      setStatus("failed");
      return;
    }

    // Stripe redirect — หา orderId จาก session_id โดย poll orders แล้ว filter
    // (simple approach: ดึง orders list แล้วหา order ที่มี stripeSessionId ตรงกัน)
    try {
      const result = await apiFetch<ApiResponse<{ orders: Array<{ id: string; stripeSessionId: string | null; type: string }> }>>("/orders");
      const orders = result.data?.orders ?? [];
      const matched = orders.find((o) => o.stripeSessionId === sessionId);
      if (matched) {
        setOrderId(matched.id);
        setOrderType(matched.type === "wallet_topup" ? "topup" : "emulator");
      } else {
        // ยังหาไม่เจอ — อาจ webhook ยังไม่มา ลอง poll ใหม่
        setTimeout(resolveOrderId, 2000);
      }
    } catch {
      setStatus("failed");
    }
  }, [sessionId, directOrderId]);

  useEffect(() => {
    void resolveOrderId();
  }, [resolveOrderId]);

  // ─── Poll order status ────────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    if (status === "paid" || status === "failed") return;
    if (pollCount > 30) {
      setStatus("failed");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<ApiResponse<OrderStatusResponse>>(
          `/orders/${orderId}/status`,
        );
        const data = result.data;

        if (data.status === "paid") {
          setStatus("paid");
          if (!orderType) {
            setOrderType(data.emulatorId ? "emulator" : "topup");
          }
        } else if (data.status === "failed" || data.status === "cancelled") {
          setStatus("failed");
        } else {
          setPollCount((c) => c + 1);
        }
      } catch {
        setPollCount((c) => c + 1);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [orderId, pollCount, status, orderType]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (status === "polling") {
    return (
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 text-lg">{t("polling")}</p>
        <p className="text-gray-400 text-sm mt-1">session: {sessionId ?? orderId}</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">&#10005;</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {t("cancel.title")}
        </h1>
        <p className="text-gray-500 mb-6">{t("cancel.desc")}</p>
        <button
          onClick={() => router.push(`/${locale}/packages` as Route)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {t("cancel.try_again")}
        </button>
      </div>
    );
  }

  // paid
  return (
    <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl text-green-600">&#10003;</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">
        {tSuccess("title")}
      </h1>
      <p className="text-gray-500 mb-6">
        {orderType === "topup"
          ? tSuccess("desc_topup")
          : tSuccess("desc_emulator")}
      </p>

      <div className="flex flex-col gap-3">
        {orderType !== "topup" && orderId && (
          <button
            onClick={() =>
              router.push(`/${locale}/emulators/create?orderId=${orderId}` as Route)
            }
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {tSuccess("create_emulator")}
          </button>
        )}
        {orderType === "topup" && (
          <button
            onClick={() => router.push(`/${locale}/wallet` as Route)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {tSuccess("go_wallet")}
          </button>
        )}
        <button
          onClick={() => router.push(`/${locale}/orders` as Route)}
          className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl transition-colors"
        >
          {tSuccess("go_orders")}
        </button>
      </div>
    </div>
  );
}

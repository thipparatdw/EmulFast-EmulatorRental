"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTranslations, useLocale } from "next-intl";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-client";
import type { OrderResponse } from "@emulfast/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  data: T;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderResponse["status"] }) {
  const colorMap: Record<OrderResponse["status"], string> = {
    pending: "bg-gray-100 text-gray-700",
    awaiting_payment: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
    refunded: "bg-blue-100 text-blue-700",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersClient() {
  const t = useTranslations("orders");
  const locale = useLocale();
  const router = useRouter();

  const { data, isLoading } = useSWR<ApiResponse<{ orders: OrderResponse[] }>>(
    "/orders",
    (url: string) =>
      apiFetch<ApiResponse<{ orders: OrderResponse[] }>>(url),
  );

  const orders: OrderResponse[] = data?.data?.orders ?? [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-5 mb-3 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          <p>{t("empty")}</p>
          <button
            onClick={() => router.push(`/${locale}/packages` as Route)}
            className="mt-4 text-blue-600 hover:underline font-medium"
          >
            เลือกแพ็กเกจ
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">
                    {order.orderNumber}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {order.type in
                    { emulator_purchase: 1, emulator_renewal: 1, wallet_topup: 1 }
                      ? t(`type.${order.type as "emulator_purchase" | "emulator_renewal" | "wallet_topup"}`)
                      : order.type}{" "}
                    {order.packageCode && `— ${order.packageCode}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString(
                      locale === "th" ? "th-TH" : "en-US",
                      { dateStyle: "medium" },
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {parseFloat(order.total).toLocaleString()} THB
                  </p>
                  <StatusBadge status={order.status} />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                {order.status === "awaiting_payment" && order.stripeSessionId && (
                  <button
                    onClick={() => {
                      // Re-retrieve checkout URL from backend is not stored — user must create new order
                      router.push(`/${locale}/packages` as Route);
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {t("pay_now")}
                  </button>
                )}
                {order.status === "paid" && order.emulatorId && (
                  <button
                    onClick={() =>
                      router.push(
                        `/${locale}/emulators/${order.emulatorId}` as Route,
                      )
                    }
                    className="text-sm text-green-600 hover:underline font-medium"
                  >
                    {t("view_emulator")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

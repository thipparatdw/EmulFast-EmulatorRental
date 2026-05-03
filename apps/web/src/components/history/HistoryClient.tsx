"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-client";
import type { ApiResponse, OrderResponse, WalletResponse } from "@emulfast/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "orders" | "wallet";

// ─── Status badge ─────────────────────────────────────────────────────────────

const ORDER_STATUS_COLORS: Record<OrderResponse["status"], string> = {
  pending: "bg-gray-100 text-gray-700",
  awaiting_payment: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-blue-100 text-blue-700",
};

function OrderStatusBadge({ status }: { status: OrderResponse["status"] }) {
  const t = useTranslations("orders.status");
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {t(status)}
    </span>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab() {
  const t = useTranslations("history");
  const tOrders = useTranslations("orders");
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useSWR<ApiResponse<{ orders: OrderResponse[] }>>(
    "/orders",
    (url: string) => apiFetch<ApiResponse<{ orders: OrderResponse[] }>>(url),
  );

  const allOrders = data?.data?.orders ?? [];
  const filtered =
    statusFilter === "all"
      ? allOrders
      : allOrders.filter((o) => o.status === statusFilter);

  const statusOptions: Array<{ value: string; label: string }> = [
    { value: "all", label: t("all_statuses") },
    { value: "paid", label: tOrders("status.paid") },
    { value: "awaiting_payment", label: tOrders("status.awaiting_payment") },
    { value: "cancelled", label: tOrders("status.cancelled") },
    { value: "refunded", label: tOrders("status.refunded") },
  ];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-600 font-medium">{t("status_filter")}:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t("empty")}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t("order_number", { number: order.orderNumber })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tOrders(`type.${order.type}`)}
                    &nbsp;&bull;&nbsp;
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-sm font-bold text-gray-900">
                  {parseFloat(order.total).toFixed(2)} THB
                </p>
                <div className="flex gap-2">
                  {order.status === "awaiting_payment" && order.stripeCheckoutUrl && (
                    <a
                      href={order.stripeCheckoutUrl}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {t("pay_now")}
                    </a>
                  )}
                  {order.emulatorId && (
                    <Link
                      href={`/${locale}/emulators/${order.emulatorId}` as Route}
                      className="text-xs border border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {tOrders("view_emulator")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wallet Transactions Tab ──────────────────────────────────────────────────

function WalletTab() {
  const t = useTranslations("history");
  const tWallet = useTranslations("wallet");

  const { data, isLoading } = useSWR<ApiResponse<{ wallet: WalletResponse }>>(
    "/wallet",
    (url: string) => apiFetch<ApiResponse<{ wallet: WalletResponse }>>(url),
  );

  const wallet = data?.data?.wallet;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-36" />
          </div>
        ))}
      </div>
    );
  }

  const txs = wallet?.transactions ?? [];

  if (txs.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">{t("empty")}</div>;
  }

  return (
    <div className="space-y-2">
      {txs.map((tx) => {
        const isCredit = ["topup", "refund", "reward", "promo_credit"].includes(tx.type);
        return (
          <div key={tx.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {tWallet(`tx.${tx.type as "topup" | "spend" | "refund" | "reward" | "promo_credit" | "adjustment"}`)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(tx.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${isCredit ? "text-green-600" : "text-red-500"}`}>
                  {isCredit ? "+" : "-"}{parseFloat(tx.amount).toFixed(2)} Fcoin
                </p>
                <p className="text-xs text-gray-400">
                  {parseFloat(tx.balanceAfter).toFixed(2)} Fcoin
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HistoryClient() {
  const t = useTranslations("history");
  const [activeTab, setActiveTab] = useState<Tab>("orders");

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "orders", label: t("tabs.orders") },
    { key: "wallet", label: t("tabs.wallet") },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "wallet" && <WalletTab />}
    </div>
  );
}

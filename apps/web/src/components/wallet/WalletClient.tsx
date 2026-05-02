"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { WalletResponse } from "@emulfast/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  data: T;
}

interface TopupResult {
  orderId: string;
  checkoutUrl: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WalletClient() {
  const t = useTranslations("wallet");

  const [topupAmount, setTopupAmount] = useState(100);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  const { data, isLoading } = useSWR<ApiResponse<{ wallet: WalletResponse }>>(
    "/wallet",
    (url: string) =>
      apiFetch<ApiResponse<{ wallet: WalletResponse }>>(url),
  );

  const wallet = data?.data?.wallet;

  // ─── Handle topup ─────────────────────────────────────────────────────────

  async function handleTopup() {
    if (topupAmount < 10 || topupAmount > 10000) return;
    setTopupLoading(true);
    setTopupError(null);

    try {
      const result = await apiFetch<ApiResponse<TopupResult>>("/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amountThb: topupAmount }),
      });

      // Redirect to Stripe Checkout
      window.location.href = result.data.checkoutUrl;
    } catch (err) {
      if (err instanceof ApiError) {
        setTopupError(err.message);
      } else {
        setTopupError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
    } finally {
      setTopupLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4" />
          <div className="h-10 bg-gray-200 rounded w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      {/* Balance card */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl text-white p-6 mb-6 shadow-md">
        <p className="text-sm text-blue-200 mb-1">{t("balance")}</p>
        <p className="text-4xl font-bold">
          {parseFloat(wallet?.balance ?? "0").toFixed(2)}
        </p>
        <p className="text-blue-200 text-sm mt-1">Fcoin</p>
      </div>

      {/* Top-up card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("topup")}</h2>

        <p className="text-sm text-gray-500 mb-3">
          {t("topup_note")} &nbsp;&bull;&nbsp; {t("topup_min")} &nbsp;&bull;&nbsp; {t("topup_max")}
        </p>

        {/* Quick amounts */}
        <div className="flex gap-2 mb-4">
          {[50, 100, 300, 500, 1000].map((amt) => (
            <button
              key={amt}
              onClick={() => setTopupAmount(amt)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                topupAmount === amt
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-700 hover:border-blue-300"
              }`}
            >
              {amt}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="flex gap-3">
          <input
            type="number"
            min={10}
            max={10000}
            value={topupAmount}
            onChange={(e) => setTopupAmount(parseInt(e.target.value, 10) || 10)}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t("topup_amount")}
          />
          <button
            onClick={handleTopup}
            disabled={topupLoading || topupAmount < 10 || topupAmount > 10000}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
          >
            {topupLoading ? "กำลังดำเนินการ..." : t("topup_submit")}
          </button>
        </div>

        {topupError && (
          <p className="text-red-600 text-sm mt-2">{topupError}</p>
        )}
      </div>

      {/* Transaction history */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("tx_history")}
        </h2>

        {!wallet?.transactions?.length ? (
          <p className="text-gray-400 text-sm text-center py-6">{t("tx_empty")}</p>
        ) : (
          <div className="space-y-2">
            {wallet.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {tx.type in { topup: 1, spend: 1, refund: 1, reward: 1, promo_credit: 1, adjustment: 1 }
                      ? t(`tx.${tx.type as "topup" | "spend" | "refund" | "reward" | "promo_credit" | "adjustment"}`)
                      : tx.type}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      ["topup", "refund", "reward", "promo_credit"].includes(tx.type)
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  >
                    {["topup", "refund", "reward", "promo_credit"].includes(tx.type)
                      ? "+"
                      : "-"}
                    {parseFloat(tx.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">
                    ยอดหลัง: {parseFloat(tx.balanceAfter).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

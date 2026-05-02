"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTranslations, useLocale } from "next-intl";
import useSWR from "swr";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { Package, WalletResponse } from "@emulfast/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  data: T;
}

interface CreateOrderResult {
  order: { id: string; status: string };
  checkoutUrl: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PackagesClient() {
  const t = useTranslations("packages");
  const locale = useLocale();
  const router = useRouter();

  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "fcoin">("card");
  const [billingDays, setBillingDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pkgData } = useSWR<ApiResponse<{ packages?: Package[] }>>(
    "/packages",
    (url: string) => apiFetch<ApiResponse<{ packages?: Package[] }>>(url),
  );

  // wallet data สำหรับแสดง Fcoin balance
  const { data: walletData } = useSWR<ApiResponse<{ wallet: WalletResponse }> | null>(
    "/wallet",
    (url: string) =>
      apiFetch<ApiResponse<{ wallet: WalletResponse }>>(url).catch(() => null),
  );

  const packages: Package[] =
    (pkgData?.data as { packages?: Package[] })?.packages ?? [];

  const fcoinBalance = walletData?.data?.wallet?.balance ?? "0";

  // ─── Calculate price ─────────────────────────────────────────────────────

  function calcPrice(pkg: Package) {
    const price = parseFloat(pkg.pricePerDay) * billingDays;
    return price.toFixed(2);
  }

  function calcFcoin(pkg: Package) {
    const fcoin = parseFloat(pkg.fcoinPerDay) * billingDays;
    return fcoin.toFixed(4);
  }

  // ─── Checkout ────────────────────────────────────────────────────────────

  async function handleCheckout() {
    if (!selectedPkg) return;
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<ApiResponse<CreateOrderResult>>("/orders", {
        method: "POST",
        body: JSON.stringify({
          packageCode: selectedPkg.code,
          paymentMethod,
          billingDays,
        }),
      });

      const { order, checkoutUrl } = result.data;

      if (checkoutUrl) {
        // Card payment → redirect to Stripe Checkout
        window.location.href = checkoutUrl;
      } else {
        // Fcoin payment → order paid immediately → go to payment success
        router.push(`/${locale}/payment/success?orderId=${order.id}` as Route);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!packages.length) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <p className="text-gray-500">{t("subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{t("title")}</h1>
      <p className="text-gray-500 mb-8">{t("subtitle")}</p>

      {/* Package cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            onClick={() => setSelectedPkg(pkg)}
            className={`cursor-pointer rounded-2xl border-2 p-6 transition-all ${
              selectedPkg?.id === pkg.id
                ? "border-blue-500 bg-blue-50 shadow-md"
                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{pkg.code}</h2>
                <p className="text-sm text-gray-500">
                  {t("android", { version: pkg.androidVersion })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">
                  {parseFloat(pkg.pricePerDay).toFixed(0)}
                </p>
                <p className="text-xs text-gray-500">{t("per_day")}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm text-gray-700">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-semibold">{t("cpu", { cores: pkg.cpuCores })}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-semibold">
                  {t("ram", { mb: pkg.ramMb })}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-semibold">
                  {t("rom", { gb: pkg.romGb })}
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm text-gray-500">
              {t("fcoin_per_day")}: {parseFloat(pkg.fcoinPerDay).toFixed(2)} Fcoin/วัน
            </p>
          </div>
        ))}
      </div>

      {/* Checkout panel */}
      {selectedPkg && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {selectedPkg.code} — {t("checkout")}
          </h3>

          {/* Billing days */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("billing_days")}
            </label>
            <div className="flex gap-2">
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setBillingDays(d)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    billingDays === d
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:border-blue-300"
                  }`}
                >
                  {d} วัน
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("payment_method")}
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === "card"}
                  onChange={() => setPaymentMethod("card")}
                  className="accent-blue-600"
                />
                <span className="text-sm">{t("pay_card")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="fcoin"
                  checked={paymentMethod === "fcoin"}
                  onChange={() => setPaymentMethod("fcoin")}
                  className="accent-blue-600"
                />
                <span className="text-sm">
                  {t("pay_fcoin", { balance: parseFloat(fcoinBalance).toFixed(2) })}
                </span>
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>ราคา</span>
              <span>{calcPrice(selectedPkg)} THB</span>
            </div>
            {paymentMethod === "fcoin" && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Fcoin ที่ใช้</span>
                <span>{calcFcoin(selectedPkg)} Fcoin</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm mb-3">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            {loading ? "กำลังดำเนินการ..." : t("checkout")}
          </button>

          {paymentMethod === "fcoin" &&
            parseFloat(fcoinBalance) < parseFloat(calcFcoin(selectedPkg)) && (
              <p className="text-amber-600 text-sm mt-2 text-center">
                {t("fcoin_insufficient")}{" "}
                <button
                  onClick={() => router.push(`/${locale}/wallet` as Route)}
                  className="underline font-semibold"
                >
                  {t("topup_first")}
                </button>
              </p>
            )}
        </div>
      )}
    </div>
  );
}

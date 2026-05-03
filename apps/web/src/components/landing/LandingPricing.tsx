"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";

const PACKAGES = [
  {
    code: "SFAST",
    pricePerDay: "29",
    descKey: "sfast_desc",
    popular: false,
  },
  {
    code: "MFAST",
    pricePerDay: "39",
    descKey: "mfast_desc",
    popular: true,
  },
];

export default function LandingPricing() {
  const t = useTranslations("landing.pricing");
  const locale = useLocale();

  return (
    <section className="py-20 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{t("title")}</h2>
          <p className="text-gray-500 text-base">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.code}
              className={`relative rounded-2xl border p-6 ${
                pkg.popular
                  ? "border-blue-500 shadow-md"
                  : "border-gray-200 shadow-sm"
              }`}
            >
              {pkg.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {t("popular")}
                </span>
              )}

              <div className="mb-4">
                <h3 className="text-xl font-bold text-gray-900">{pkg.code}</h3>
                <p className="text-gray-500 text-sm mt-1">{t(pkg.descKey)}</p>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-extrabold text-gray-900">
                  {pkg.pricePerDay}
                </span>
                <span className="text-gray-500 text-sm ml-1">{t("per_day")}</span>
              </div>

              <Link
                href={`/${locale}/packages` as Route}
                className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  pkg.popular
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {t("cta")}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

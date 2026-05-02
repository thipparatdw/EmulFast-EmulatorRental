"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";

export default function LandingCTA() {
  const t = useTranslations("landing.cta");
  const locale = useLocale();

  return (
    <section className="py-20 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">{t("title")}</h2>
        <p className="text-blue-100 text-base mb-8">{t("desc")}</p>
        <Link
          href={`/${locale}/register` as Route}
          className="inline-block bg-white text-blue-700 font-bold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base"
        >
          {t("button")}
        </Link>
      </div>
    </section>
  );
}

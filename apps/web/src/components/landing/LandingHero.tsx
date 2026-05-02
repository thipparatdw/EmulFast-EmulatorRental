"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";

export default function LandingHero() {
  const t = useTranslations("landing.hero");
  const locale = useLocale();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {t("badge")}
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-4">
          {t("title")}
          <br />
          <span className="text-blue-200">{t("title_highlight")}</span>
        </h1>

        {/* Description */}
        <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t("desc")}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/${locale}/register` as Route}
            className="bg-white text-blue-700 font-bold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base"
          >
            {t("cta_start")}
          </Link>
          <Link
            href={`/${locale}/packages` as Route}
            className="border-2 border-white/40 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/10 transition-colors text-base"
          >
            {t("cta_packages")}
          </Link>
        </div>

        {/* Trust indicator */}
        <p className="text-blue-200 text-sm mt-8">
          Android 10 / 12 &bull; KVM acceleration &bull; H.264 streaming
        </p>
      </div>
    </section>
  );
}

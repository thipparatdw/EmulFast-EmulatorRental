"use client";

import { useTranslations } from "next-intl";

const FEATURE_ICONS = {
  instant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  anywhere: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <circle cx={12} cy={12} r={10} />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  secure: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

const FEATURE_COLORS = {
  instant: "bg-blue-50 text-blue-600",
  anywhere: "bg-green-50 text-green-600",
  secure: "bg-purple-50 text-purple-600",
};

export default function LandingFeatures() {
  const t = useTranslations("landing.features");
  const features = ["instant", "anywhere", "secure"] as const;

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{t("title")}</h2>
          <p className="text-gray-500 text-base">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {features.map((key) => (
            <div key={key} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${FEATURE_COLORS[key]}`}>
                {FEATURE_ICONS[key]}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t(`${key}.title`)}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {t(`${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

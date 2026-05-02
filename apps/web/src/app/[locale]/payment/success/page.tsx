import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import PaymentSuccessClient from "@/components/payment/PaymentSuccessClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.success" });
  return {
    title: `${t("title")} — EmulFast`,
  };
}

export default async function PaymentSuccessPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      {/* Suspense required because PaymentSuccessClient uses useSearchParams */}
      <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
        <PaymentSuccessClient />
      </Suspense>
    </main>
  );
}

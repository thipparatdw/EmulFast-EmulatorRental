import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import EmulatorCreateClient from "@/components/emulator/EmulatorCreateClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function EmulatorCreatePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
        <EmulatorCreateClient />
      </Suspense>
    </main>
  );
}

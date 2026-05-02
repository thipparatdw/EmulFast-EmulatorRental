import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import EmulatorViewer from "@/components/emulator/EmulatorViewer";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "emulator.viewer" });
  return {
    title: `${t("title")} — EmulFast`,
  };
}

export default async function EmulatorPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-gray-50">
      <EmulatorViewer emulatorId={id} />
    </main>
  );
}

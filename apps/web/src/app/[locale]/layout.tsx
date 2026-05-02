import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "EmulFast",
  description: "Cloud Android Emulator Platform",
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // ตรวจสอบว่า locale ที่รับมาอยู่ใน supported list
  if (!routing.locales.includes(locale as "th" | "en")) {
    notFound();
  }

  // บอก next-intl ให้ใช้ locale นี้ใน static rendering
  setRequestLocale(locale);

  // โหลด messages สำหรับ client components
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

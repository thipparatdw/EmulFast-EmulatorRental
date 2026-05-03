import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // ตรวจสอบว่า locale ที่ได้รับอยู่ใน supported locales หรือไม่
  if (!locale || !routing.locales.includes(locale as "th" | "en")) {
    locale = routing.defaultLocale;
  }

  const messages = (
    await import(`../../messages/${locale}.json`)
  ).default as AbstractIntlMessages;

  return {
    locale,
    messages,
  };
});

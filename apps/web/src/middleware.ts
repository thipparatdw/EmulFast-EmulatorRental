import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // ดัก path ทุกอย่างยกเว้น _next, api, และ static files
  matcher: [
    // เปิดใช้ redirect ที่ root
    "/",
    // ดัก /(th|en) และ sub-paths ทั้งหมด
    "/(th|en)/:path*",
    // ดัก path อื่นๆ ที่ไม่ใช่ _next หรือ static files
    "/((?!_next|api|.*\\..*).*)",
  ],
};

import Link from "next/link";
import type { Route } from "next";

export default function LocaleNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg text-gray-600">Page not found</p>
      <Link
        href={"/" as Route}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}

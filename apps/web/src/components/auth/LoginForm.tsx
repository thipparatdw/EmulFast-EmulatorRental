"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { AuthTokenResponse } from "@emulfast/shared";

// ─── Validation schema ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginFields = z.infer<typeof loginSchema>;
type FieldErrors = Partial<Record<keyof LoginFields, string>>;

interface ApiResponse<T> {
  data: T;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginForm() {
  const t = useTranslations("auth_page.login");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [values, setValues] = useState<LoginFields>({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name as keyof LoginFields]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setServerError(null);
  }

  function validate(): boolean {
    const result = loginSchema.safeParse(values);
    if (result.success) {
      setFieldErrors({});
      return true;
    }
    const errors: FieldErrors = {};
    result.error.issues.forEach((issue) => {
      const field = issue.path[0] as keyof LoginFields;
      if (!errors[field]) {
        if (field === "email") {
          errors[field] = issue.message === "Invalid email"
            ? t("errors.email_invalid")
            : t("errors.email_required");
        } else if (field === "password") {
          errors[field] = values.password.length === 0
            ? t("errors.password_required")
            : t("errors.password_min");
        }
      }
    });
    setFieldErrors(errors);
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError(null);

    try {
      const res = await apiFetch<ApiResponse<AuthTokenResponse>>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      // Store token
      localStorage.setItem("access_token", res.data.accessToken);
      // Redirect to dashboard
      router.push(`/${locale}/dashboard` as Route);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setServerError(t("errors.email_invalid"));
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("subtitle")}</p>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={handleChange}
              placeholder={t("email_placeholder")}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                fieldErrors.email
                  ? "border-red-400 bg-red-50"
                  : "border-gray-300 bg-white"
              }`}
            />
            {fieldErrors.email && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={handleChange}
              placeholder={t("password_placeholder")}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                fieldErrors.password
                  ? "border-red-400 bg-red-50"
                  : "border-gray-300 bg-white"
              }`}
            />
            {fieldErrors.password && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? t("loading") : t("submit")}
          </button>
        </form>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {t("no_account")}{" "}
          <Link
            href={`/${locale}/register` as Route}
            className="text-blue-600 font-medium hover:underline"
          >
            {t("register_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}

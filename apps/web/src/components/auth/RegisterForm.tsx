"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { AuthTokenResponse } from "@emulfast/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type RegisterFields = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
  acceptTerms: boolean;
};

type FieldErrors = Partial<Record<keyof RegisterFields, string>>;

interface ApiResponse<T> {
  data: T;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterForm() {
  const t = useTranslations("auth_page.register");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [values, setValues] = useState<RegisterFields>({
    displayName: "",
    email: "",
    phone: "",
    password: "",
    acceptTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;
    setValues((prev) => ({ ...prev, [name]: newValue }));
    if (fieldErrors[name as keyof RegisterFields]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setServerError(null);
  }

  function getPasswordError(password: string): string | undefined {
    if (!password) return t("errors.password_required");
    if (password.length < 8) return t("errors.password_min");
    if (!/[A-Z]/.test(password)) return t("errors.password_uppercase");
    if (!/[a-z]/.test(password)) return t("errors.password_lowercase");
    if (!/[0-9]/.test(password)) return t("errors.password_digit");
    return undefined;
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!values.displayName.trim()) {
      errors.displayName = t("errors.name_required");
    } else if (values.displayName.trim().length < 2) {
      errors.displayName = t("errors.name_min");
    }

    if (!values.email) {
      errors.email = t("errors.email_required");
    } else {
      const emailResult = z.string().email().safeParse(values.email);
      if (!emailResult.success) errors.email = t("errors.email_invalid");
    }

    if (values.phone) {
      const phoneResult = z
        .string()
        .regex(/^\+?[0-9]{8,15}$/)
        .safeParse(values.phone);
      if (!phoneResult.success) errors.phone = t("errors.phone_invalid");
    }

    const pwdError = getPasswordError(values.password);
    if (pwdError) errors.password = pwdError;

    if (!values.acceptTerms) {
      errors.acceptTerms = t("errors.terms_required");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError(null);

    try {
      const body: Record<string, unknown> = {
        email: values.email,
        password: values.password,
        displayName: values.displayName.trim(),
        acceptTerms: true,
        locale,
      };
      if (values.phone) {
        body.phone = values.phone;
      }

      const res = await apiFetch<ApiResponse<AuthTokenResponse>>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      localStorage.setItem("access_token", res.data.accessToken);
      router.push(`/${locale}/dashboard` as Route);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "CONFLICT") {
          setFieldErrors((prev) => ({ ...prev, email: t("errors.email_taken") }));
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
          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              {t("display_name")}
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              value={values.displayName}
              onChange={handleChange}
              placeholder={t("display_name_placeholder")}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                fieldErrors.displayName ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
            {fieldErrors.displayName && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.displayName}</p>
            )}
          </div>

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
                fieldErrors.email ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
            {fieldErrors.email && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Phone (optional) */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              {t("phone")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={handleChange}
              placeholder={t("phone_placeholder")}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                fieldErrors.phone ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
            {fieldErrors.phone && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.phone}</p>
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
              autoComplete="new-password"
              value={values.password}
              onChange={handleChange}
              placeholder={t("password_placeholder")}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                fieldErrors.password ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
            {fieldErrors.password && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>
            )}
          </div>

          {/* Accept Terms */}
          <div className="flex items-start gap-2">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              checked={values.acceptTerms}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="acceptTerms" className="text-sm text-gray-600">
              {t("accept_terms")}{" "}
              <span className="text-blue-600 font-medium">{t("terms_link")}</span>
            </label>
          </div>
          {fieldErrors.acceptTerms && (
            <p className="text-red-600 text-xs -mt-2">{fieldErrors.acceptTerms}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? t("loading") : t("submit")}
          </button>
        </form>

        {/* Login link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {t("has_account")}{" "}
          <Link
            href={`/${locale}/login` as Route}
            className="text-blue-600 font-medium hover:underline"
          >
            {t("login_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}

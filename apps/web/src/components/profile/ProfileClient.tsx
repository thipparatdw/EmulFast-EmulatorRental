"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import useSWR from "swr";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ApiResponse, UserProfileResponse } from "@emulfast/shared";

// ─── Avatar Placeholder ───────────────────────────────────────────────────────

function AvatarPlaceholder({ displayName }: { displayName: string }) {
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      aria-label="Profile avatar"
      className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold select-none"
    >
      {initials || "?"}
    </div>
  );
}

// ─── Edit Profile Form ────────────────────────────────────────────────────────

function EditProfileSection({
  profile,
  onSuccess,
}: {
  profile: UserProfileResponse;
  onSuccess: () => void;
}) {
  const t = useTranslations("profile.edit");
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [errors, setErrors] = useState<{ displayName?: string; phone?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errs: typeof errors = {};
    if (displayName.trim().length < 2) errs.displayName = t("errors.name_min");
    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) errs.phone = t("errors.phone_invalid");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError(null);
    setSuccessMsg(null);
    try {
      const body: Record<string, unknown> = { displayName: displayName.trim() };
      if (phone) body.phone = phone;
      else body.phone = null;

      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSuccessMsg(t("success"));
      onSuccess();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("title")}</h2>
      {serverError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("display_name")}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.displayName ? "border-red-400" : "border-gray-300"}`}
          />
          {errors.displayName && <p className="text-red-600 text-xs mt-1">{errors.displayName}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("phone")}</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phone_placeholder")}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? "border-red-400" : "border-gray-300"}`}
          />
          {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {loading ? t("saving") : t("save")}
        </button>
      </form>
    </section>
  );
}

// ─── Change Password Form ─────────────────────────────────────────────────────

function ChangePasswordSection() {
  const t = useTranslations("profile.password");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<{ oldPassword?: string; newPassword?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getNewPasswordError(pwd: string): string | undefined {
    if (!pwd) return t("errors.new_required");
    if (pwd.length < 8) return t("errors.new_min");
    if (!/[A-Z]/.test(pwd)) return t("errors.new_uppercase");
    if (!/[a-z]/.test(pwd)) return t("errors.new_lowercase");
    if (!/[0-9]/.test(pwd)) return t("errors.new_digit");
    return undefined;
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!oldPassword) errs.oldPassword = t("errors.old_required");
    const newErr = getNewPasswordError(newPassword);
    if (newErr) errs.newPassword = newErr;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError(null);
    setSuccessMsg(null);
    try {
      await apiFetch("/users/me/password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setSuccessMsg(t("success"));
      setOldPassword("");
      setNewPassword("");
      setErrors({});
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrors((prev) => ({ ...prev, oldPassword: t("errors.wrong_old") }));
        } else if (err.code === "VALIDATION_ERROR") {
          setErrors((prev) => ({ ...prev, newPassword: t("errors.same_password") }));
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("title")}</h2>
      {serverError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("old_password")}</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.oldPassword ? "border-red-400" : "border-gray-300"}`}
          />
          {errors.oldPassword && <p className="text-red-600 text-xs mt-1">{errors.oldPassword}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("new_password")}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.newPassword ? "border-red-400" : "border-gray-300"}`}
          />
          {errors.newPassword && <p className="text-red-600 text-xs mt-1">{errors.newPassword}</p>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {loading ? t("saving") : t("save")}
        </button>
      </form>
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProfileClient() {
  const t = useTranslations("profile");
  const locale = useLocale();

  const { data, isLoading, mutate } = useSWR<ApiResponse<UserProfileResponse>>(
    "/users/me",
    (url: string) => apiFetch<ApiResponse<UserProfileResponse>>(url),
  );

  const profile = data?.data;

  if (isLoading || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-32" />
          <div className="bg-white rounded-2xl border p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-24" />
            <div className="h-10 bg-gray-200 rounded-xl" />
            <div className="h-10 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tierLabel = profile.membershipTierCode
    ? profile.membershipTierCode.charAt(0).toUpperCase() + profile.membershipTierCode.slice(1)
    : "Bronze";

  return (
    <div className="max-w-2xl mx-auto px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <AvatarPlaceholder displayName={profile.displayName} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
          <p className="text-gray-500 text-sm">{profile.email}</p>
          <p className="text-blue-600 text-sm font-medium mt-1">
            {t("membership.tier", { tier: tierLabel })}
            &nbsp;&bull;&nbsp;
            {t("membership.points", { points: profile.membershipPoints })}
          </p>
        </div>
      </div>

      {/* Wallet summary */}
      {profile.wallet && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("wallet.title")}</h2>
          <p className="text-gray-700 text-sm">
            {t("wallet.balance", { balance: parseFloat(profile.wallet.balance).toFixed(2) })}
          </p>
          <Link
            href={`/${locale}/wallet` as Route}
            className="text-blue-600 text-sm font-medium hover:underline mt-2 inline-block"
          >
            {t("wallet.topup_link")}
          </Link>
        </div>
      )}

      {/* Edit profile */}
      <EditProfileSection profile={profile} onSuccess={() => void mutate()} />

      {/* Change password */}
      <ChangePasswordSection />
    </div>
  );
}

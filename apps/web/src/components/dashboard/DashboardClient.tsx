"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import useSWR from "swr";
import { io, Socket } from "socket.io-client";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ToastContainer, useToast } from "@/components/ui/Toast";
import type { ApiResponse, EmulatorResponse, EmulatorStatus } from "@emulfast/shared";

// ─── WS URL ───────────────────────────────────────────────────────────────────

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const STATUS_COLORS: Record<EmulatorStatus, string> = {
  running: "bg-green-100 text-green-800 border-green-200",
  provisioning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  stopping: "bg-orange-100 text-orange-800 border-orange-200",
  stopped: "bg-gray-100 text-gray-700 border-gray-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  terminated: "bg-gray-100 text-gray-500 border-gray-200",
};

// ─── Emulator Card ────────────────────────────────────────────────────────────

interface EmulatorCardProps {
  emulator: EmulatorResponse;
  onRenew: (id: string) => void;
  renewingId: string | null;
}

function EmulatorCard({ emulator, onRenew, renewingId }: EmulatorCardProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [, setTick] = useState(0);

  // Force re-render every 30s for countdown
  useEffect(() => {
    if (emulator.status !== "running" && emulator.status !== "provisioning") return;
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [emulator.status]);

  const isExpired = emulator.status === "expired" || emulator.status === "terminated";
  const isActive = emulator.status === "running";
  const isRenewing = renewingId === emulator.id;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-base">
            {emulator.package.nameKey}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("android_version", { version: emulator.package.androidVersion })}
            &nbsp;&bull;&nbsp;
            {emulator.package.cpuCores} cores&nbsp;&bull;&nbsp;
            {emulator.package.ramMb} MB RAM
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[emulator.status]}`}
        >
          {emulator.status === "running" && (
            <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          )}
          {t(`status.${emulator.status}`)}
        </span>
      </div>

      {/* Expiry */}
      {!isExpired && (
        <p className="text-sm text-gray-500 mb-4">
          {emulator.status === "expired"
            ? t("expired_at", {
                date: new Date(emulator.expiresAt).toLocaleDateString(),
              })
            : t("expires_in", { time: formatCountdown(emulator.expiresAt) })}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {isActive && (
          <Link
            href={`/${locale}/emulators/${emulator.id}` as Route}
            className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
          >
            {t("view")}
          </Link>
        )}
        {!isExpired && (
          <button
            onClick={() => onRenew(emulator.id)}
            disabled={isRenewing}
            className={`${isActive ? "" : "flex-1"} border border-gray-300 hover:border-blue-400 text-gray-700 hover:text-blue-600 font-semibold py-2 px-4 rounded-xl text-sm transition-colors disabled:opacity-50`}
          >
            {isRenewing ? "..." : t("renew")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useTranslations("dashboard.empty");
  const locale = useLocale();

  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("title")}</h3>
      <p className="text-gray-500 text-sm mb-6">{t("desc")}</p>
      <Link
        href={`/${locale}/packages` as Route}
        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
      >
        {t("cta")}
      </Link>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardClient() {
  const t = useTranslations("dashboard");
  const tNotif = useTranslations("notifications");
  const { toasts, addToast, removeToast } = useToast();
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Map<string, EmulatorStatus>>(new Map());

  const { data, isLoading, mutate } = useSWR<ApiResponse<{ emulators: EmulatorResponse[] }>>(
    "/emulators",
    (url: string) => apiFetch<ApiResponse<{ emulators: EmulatorResponse[] }>>(url),
    { refreshInterval: 30_000 },
  );

  const emulators = data?.data?.emulators ?? [];

  // ─── WS subscription ────────────────────────────────────────────────────────

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const socket: Socket = io(`${WS_URL}/ws/emulator`, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });

    socket.on(
      "emulator.status",
      (event: { emulatorId: string; status: EmulatorStatus; expiresAt: string }) => {
        setLiveStatuses((prev) => new Map(prev).set(event.emulatorId, event.status));
        // Show toast for notable transitions
        if (event.status === "running") {
          addToast("success", tNotif("emulator_status_running"));
          void mutate();
        } else if (event.status === "expired") {
          addToast("warning", tNotif("emulator_status_expired"));
          void mutate();
        } else if (event.status === "failed") {
          addToast("error", tNotif("emulator_status_failed"));
        }
      },
    );

    socket.on(
      "emulator.expiring",
      (event: { emulatorId: string; minutesLeft: number }) => {
        addToast("warning", tNotif("emulator_expiring", { minutes: event.minutesLeft }));
      },
    );

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Quick renew ────────────────────────────────────────────────────────────

  const handleRenew = useCallback(
    async (id: string) => {
      const emulator = emulators.find((e) => e.id === id);
      if (!emulator) return;

      setRenewingId(id);
      try {
        await apiFetch(`/emulators/${id}/renew`, {
          method: "POST",
          body: JSON.stringify({ packageCode: emulator.packageCode, paymentMethod: "fcoin" }),
        });
        addToast("success", tNotif("renew_success"));
        void mutate();
      } catch (err) {
        if (err instanceof ApiError && err.code === "INSUFFICIENT_FUNDS") {
          addToast("error", tNotif("renew_error"));
        } else {
          addToast("error", tNotif("renew_error"));
        }
      } finally {
        setRenewingId(null);
      }
    },
    [emulators, mutate, addToast, tNotif],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("subtitle")}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
                <div className="h-9 bg-gray-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : emulators.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {emulators.map((emulator) => {
              // Apply live status override from WS if available
              const liveStatus = liveStatuses.get(emulator.id);
              const displayEmulator = liveStatus
                ? { ...emulator, status: liveStatus }
                : emulator;
              return (
                <EmulatorCard
                  key={emulator.id}
                  emulator={displayEmulator}
                  onRenew={handleRenew}
                  renewingId={renewingId}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

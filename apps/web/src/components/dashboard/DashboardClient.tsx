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

  useEffect(() => {
    if (emulator.status !== "running" && emulator.status !== "provisioning") return;
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [emulator.status]);

  const isActive = emulator.status === "running";
  const isProvisioning = emulator.status === "provisioning";
  const isRenewing = renewingId === emulator.id;

  const streamSrc = emulator.websocketUrl
    ? emulator.websocketUrl.replace(/^ws(s?):\/\//, "http$1://")
    : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* ── Preview Screen Area ── */}
      <div className="relative bg-gray-900 overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: "280px" }}>
        {isActive && streamSrc ? (
          <>
            {/* Scaled iframe preview — pointer-events:none so clicks reach the Link overlay */}
            <iframe
              src={streamSrc}
              title="preview"
              className="absolute inset-0 border-0"
              style={{
                width: "400%",
                height: "400%",
                transform: "scale(0.25)",
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
              sandbox="allow-scripts allow-same-origin"
            />
            {/* LIVE badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </div>
          </>
        ) : isProvisioning ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-blue-300">{t("status.provisioning")}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 text-gray-600 opacity-40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3" />
            </svg>
          </div>
        )}

        {/* Clickable overlay — navigate to viewer on click */}
        {isActive && (
          <Link
            href={`/${locale}/emulators/${emulator.id}` as Route}
            className="absolute inset-0 z-10 flex items-end justify-center pb-3 opacity-0 hover:opacity-100 transition-opacity bg-black/20"
            aria-label={t("view")}
          >
            <span className="bg-white text-gray-900 font-semibold text-xs px-4 py-1.5 rounded-full shadow">
              {t("view")} →
            </span>
          </Link>
        )}
      </div>

      {/* ── Info + Actions ── */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">
              {emulator.package.nameKey}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Android {emulator.package.androidVersion} &bull; {emulator.package.cpuCores}C / {emulator.package.ramMb}MB
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[emulator.status]}`}>
            {emulator.status === "running" && (
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
            {t(`status.${emulator.status}`)}
          </span>
        </div>

        <p className="text-xs text-gray-500">
          {t("expires_in", { time: formatCountdown(emulator.expiresAt) })}
        </p>

        <div className="flex gap-2 mt-auto">
          {isActive && (
            <Link
              href={`/${locale}/emulators/${emulator.id}` as Route}
              className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-xs transition-colors"
            >
              {t("view")}
            </Link>
          )}
          <button
            onClick={() => onRenew(emulator.id)}
            disabled={isRenewing}
            className={`${isActive ? "" : "flex-1"} border border-gray-300 hover:border-blue-400 text-gray-700 hover:text-blue-600 font-semibold py-2 px-3 rounded-xl text-xs transition-colors disabled:opacity-50`}
          >
            {isRenewing ? "..." : t("renew")}
          </button>
        </div>
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

  const allEmulators = data?.data?.emulators ?? [];
  const emulators = allEmulators.filter(
    (e) => e.status !== "terminated" && e.status !== "expired" && e.status !== "stopped",
  );

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
        } else if (event.status === "expired" || event.status === "terminated") {
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
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("subtitle")}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="bg-gray-200" style={{ aspectRatio: "9/16", maxHeight: "280px" }} />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-3 bg-gray-200 rounded w-32" />
                  <div className="h-8 bg-gray-200 rounded-xl mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : emulators.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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

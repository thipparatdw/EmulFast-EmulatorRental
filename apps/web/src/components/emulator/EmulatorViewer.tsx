"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import useSWR from "swr";
import { useEmulatorSocket } from "@/hooks/useEmulatorSocket";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { EmulatorResponse, EmulatorStatus } from "@emulfast/shared";
import type { ApiResponse } from "@emulfast/shared";

interface EmulatorViewerProps {
  emulatorId: string;
}

function StatusDot({ status }: { status: EmulatorStatus }) {
  const colorMap: Record<EmulatorStatus, string> = {
    running: "bg-green-400",
    provisioning: "bg-yellow-400 animate-pulse",
    stopping: "bg-orange-400",
    stopped: "bg-gray-400",
    expired: "bg-red-400",
    terminated: "bg-gray-500",
    failed: "bg-red-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colorMap[status]}`} />;
}

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ConfirmDialog({
  message, onConfirm, onCancel, confirmLabel, cancelLabel,
}: {
  message: string; onConfirm: () => void; onCancel: () => void;
  confirmLabel: string; cancelLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-xl bg-gray-800 border border-gray-700 p-6 shadow-2xl">
        <p className="mb-6 text-sm text-gray-200">{message}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmulatorViewer({ emulatorId }: EmulatorViewerProps) {
  const t = useTranslations("emulator.viewer");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<ApiResponse<{ emulator: EmulatorResponse }>>(
    `/emulators/${emulatorId}`,
    (path: string) => apiFetch<ApiResponse<{ emulator: EmulatorResponse }>>(path),
    {
      refreshInterval: 10_000,
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/${locale}/auth/login` as Route);
        }
      },
    },
  );

  const handleStatusChange = useCallback(
    (newStatus: EmulatorStatus, expiresAt: string) => {
      mutate(
        (prev) => {
          if (!prev) return prev;
          return { ...prev, data: { emulator: { ...prev.data.emulator, status: newStatus, expiresAt } } };
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const { minutesLeft, isConnected } = useEmulatorSocket(emulatorId, handleStatusChange);

  const handleTerminate = async () => {
    setIsTerminating(true);
    setTerminateError(null);
    try {
      await apiFetch(`/emulators/${emulatorId}`, { method: "DELETE" });
      setShowConfirm(false);
      router.push(`/${locale}/dashboard` as Route);
    } catch (err) {
      setTerminateError(err instanceof ApiError ? err.message : tCommon("error"));
      setIsTerminating(false);
      setShowConfirm(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-gray-300 gap-4">
        <p className="text-lg font-semibold">{t("not_found")}</p>
        <Link href={`/${locale}/dashboard` as Route}
          className="text-sm text-blue-400 hover:underline">{t("back_to_list")}</Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-gray-400 gap-3">
        <p className="text-sm">{tCommon("error")}</p>
        <button onClick={() => mutate()}
          className="text-sm text-blue-400 hover:underline">{tCommon("retry")}</button>
      </div>
    );
  }

  const emulator = data.data.emulator;
  const isRunning = emulator.status === "running";
  const streamUrl = emulator.websocketUrl
    ? emulator.websocketUrl.replace(/^ws(s?):\/\//, "http$1://")
    : null;

  const expiresAtFormatted = new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : "en-GB",
    { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" },
  ).format(new Date(emulator.expiresAt));

  const isExpiringSoon = minutesLeft !== null && minutesLeft <= 10;

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* ── Confirm dialog ─────────────────────────────────────────────────── */}
      {showConfirm && (
        <ConfirmDialog
          message={t("terminate_confirm")}
          onConfirm={handleTerminate}
          onCancel={() => setShowConfirm(false)}
          confirmLabel={t("terminate")}
          cancelLabel={tCommon("cancel")}
        />
      )}

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 gap-4">
        {/* Left: back + info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/${locale}/dashboard` as Route}
            className="text-gray-400 hover:text-gray-200 shrink-0"
            aria-label="back to dashboard">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={emulator.status} />
            <span className="text-white font-semibold text-sm truncate">{emulator.packageCode}</span>
            <span className="text-gray-500 text-xs hidden sm:block">
              Android {emulator.package.androidVersion} &bull; {emulator.package.cpuCores}C / {emulator.package.ramMb}MB
            </span>
          </div>
        </div>

        {/* Right: timer + WS indicator + terminate */}
        <div className="flex items-center gap-3 shrink-0">
          {!isExpiringSoon && (
            <span className="text-gray-400 text-xs hidden sm:block">
              {formatCountdown(emulator.expiresAt)}
            </span>
          )}
          <span
            className={`flex items-center gap-1 text-xs ${isConnected ? "text-green-400" : "text-gray-500"}`}
            title={isConnected ? t("connected") : t("disconnected")}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400" : "bg-gray-500"}`} />
            <span className="hidden sm:block">{isConnected ? "Live" : "Offline"}</span>
          </span>

          {emulator.status !== "terminated" && emulator.status !== "expired" && (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={isTerminating}
              className="flex items-center gap-1.5 border border-red-800 text-red-400 hover:bg-red-900/30 px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
              {isTerminating ? "..." : t("terminate")}
            </button>
          )}
        </div>
      </header>

      {/* ── Expiring soon warning ────────────────────────────────────────────── */}
      {isExpiringSoon && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-900/40 border-b border-yellow-800/50 text-yellow-300 text-xs shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {t("expiring_soon", { minutes: minutesLeft })}
          &nbsp;&bull;&nbsp;
          <span className="font-medium">{expiresAtFormatted}</span>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {terminateError && (
        <div className="px-4 py-2 bg-red-900/40 border-b border-red-800/50 text-red-300 text-xs shrink-0">
          {terminateError}
        </div>
      )}

      {/* ── Stream area — fills remaining height ─────────────────────────────── */}
      <main className="flex-1 min-h-0 bg-gray-950 flex items-center justify-center overflow-hidden">
        {isRunning && streamUrl ? (
          <iframe
            src={streamUrl}
            title="Android Emulator Stream"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            allow="fullscreen"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.75} stroke="currentColor" className="w-24 h-24 opacity-30">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3" />
            </svg>
            <p className="text-sm text-gray-500">
              {emulator.status === "provisioning"
                ? t("stream_placeholder")
                : t("stream_not_available")}
            </p>
            {emulator.status === "provisioning" && (
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

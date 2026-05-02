"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTranslations, useLocale } from "next-intl";
import useSWR from "swr";
import { useEmulatorSocket } from "@/hooks/useEmulatorSocket";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { EmulatorResponse, EmulatorStatus } from "@emulfast/shared";
import type { ApiResponse } from "@emulfast/shared";

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmulatorViewerProps {
  emulatorId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  label,
}: {
  status: EmulatorStatus;
  label: string;
}) {
  const colorMap: Record<EmulatorStatus, string> = {
    running: "bg-green-100 text-green-800 border-green-200",
    provisioning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    stopping: "bg-orange-100 text-orange-800 border-orange-200",
    stopped: "bg-gray-100 text-gray-700 border-gray-200",
    expired: "bg-red-100 text-red-700 border-red-200",
    terminated: "bg-gray-100 text-gray-500 border-gray-200",
    failed: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[status]}`}
      aria-label={`Status: ${label}`}
    >
      {status === "running" && (
        <span
          className="mr-1.5 h-2 w-2 rounded-full bg-green-500 animate-pulse"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 rounded bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="h-[480px] rounded-xl bg-gray-200" />
      <div className="h-4 w-48 rounded bg-gray-200" />
      <div className="h-10 w-36 rounded bg-gray-200" />
    </div>
  );
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  cancelLabel: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={confirmLabel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <p className="mb-6 text-sm text-gray-700">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmulatorViewer({ emulatorId }: EmulatorViewerProps) {
  const t = useTranslations("emulator.viewer");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  // ─── SWR fetch emulator detail ─────────────────────────────────────────────

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<ApiResponse<{ emulator: EmulatorResponse }>>(
    `/api/emulators/${emulatorId}`,
    (path: string) =>
      apiFetch<ApiResponse<{ emulator: EmulatorResponse }>>(path),
    {
      refreshInterval: 10_000,
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/${locale}/auth/login` as Route);
        }
      },
    },
  );

  // ─── Socket.IO — รับ status update real-time ────────────────────────────────

  const handleStatusChange = useCallback(
    (newStatus: EmulatorStatus, expiresAt: string) => {
      mutate(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: {
              emulator: {
                ...prev.data.emulator,
                status: newStatus,
                expiresAt,
              },
            },
          };
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const { minutesLeft, isConnected } = useEmulatorSocket(
    emulatorId,
    handleStatusChange,
  );

  // ─── Terminate ─────────────────────────────────────────────────────────────

  const handleTerminate = async () => {
    setIsTerminating(true);
    setTerminateError(null);
    try {
      await apiFetch(`/api/emulators/${emulatorId}`, { method: "DELETE" });
      setShowConfirm(false);
      router.push(`/${locale}/dashboard` as Route);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : tCommon("error");
      setTerminateError(msg);
      setIsTerminating(false);
      setShowConfirm(false);
    }
  };

  // ─── Render states ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">
          {t("not_found")}
        </h2>
        <p className="mb-6 text-sm text-gray-500">{t("not_found_desc")}</p>
        <a
          href={`/${locale}/dashboard`}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {t("back_to_list")}
        </a>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-red-600">{tCommon("error")}</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          {tCommon("retry")}
        </button>
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
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    },
  ).format(new Date(emulator.expiresAt));

  return (
    <>
      {/* Terminate confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          message={t("terminate_confirm")}
          onConfirm={handleTerminate}
          onCancel={() => setShowConfirm(false)}
          confirmLabel={t("terminate")}
          cancelLabel={tCommon("cancel")}
        />
      )}

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              {tCommon("appName")}
            </h1>
            <span className="text-sm text-gray-500" aria-label={t("package_label")}>
              {emulator.packageCode}
            </span>
            <StatusBadge
              status={emulator.status}
              label={t(`status.${emulator.status}`)}
            />
          </div>

          {/* Connection indicator */}
          <span
            className={`flex items-center gap-1.5 text-xs ${
              isConnected ? "text-green-600" : "text-gray-400"
            }`}
            aria-label={isConnected ? t("connected") : t("disconnected")}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-gray-300"
              }`}
              aria-hidden="true"
            />
            {isConnected ? t("connected") : t("disconnected")}
          </span>
        </div>

        {/* Expiring soon warning */}
        {minutesLeft !== null && minutesLeft <= 10 && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            {t("expiring_soon", { minutes: minutesLeft })}
          </div>
        )}

        {/* Stream area */}
        <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-900">
          {isRunning && streamUrl ? (
            <iframe
              src={streamUrl}
              title="Android Emulator Stream"
              className="h-[480px] w-full border-0"
              aria-label="Android Emulator Stream"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="flex h-[480px] flex-col items-center justify-center gap-3 text-gray-400">
              {/* Phone icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
                className="h-16 w-16 opacity-30"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3"
                />
              </svg>
              <p className="text-sm">
                {isRunning
                  ? t("stream_placeholder")
                  : t("stream_not_available")}
              </p>
              <StatusBadge
                status={emulator.status}
                label={t(`status.${emulator.status}`)}
              />
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
          <span aria-label={t("expires_at", { date: expiresAtFormatted })}>
            {t("expires_at", { date: expiresAtFormatted })}
          </span>
        </div>

        {/* Terminate error */}
        {terminateError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {terminateError}
          </div>
        )}

        {/* Terminate button — แสดงเฉพาะ status ที่ยังไม่ถูก terminate/expired */}
        {emulator.status !== "terminated" &&
          emulator.status !== "expired" && (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={isTerminating}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("terminate")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
              {isTerminating ? tCommon("loading") : t("terminate")}
            </button>
          )}
      </div>
    </>
  );
}

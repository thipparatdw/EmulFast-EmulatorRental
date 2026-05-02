"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { EmulatorStatus } from "@emulfast/shared";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

interface EmulatorStatusEvent {
  emulatorId: string;
  status: EmulatorStatus;
  expiresAt: string;
}

interface EmulatorExpiringEvent {
  emulatorId: string;
  minutesLeft: number;
}

interface UseEmulatorSocketResult {
  status: EmulatorStatus | null;
  minutesLeft: number | null;
  isConnected: boolean;
}

export function useEmulatorSocket(
  emulatorId: string,
  onStatusChange?: (status: EmulatorStatus, expiresAt: string) => void,
): UseEmulatorSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<EmulatorStatus | null>(null);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    const socket = io(`${WS_URL}/ws/emulator`, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("emulator.status", (event: EmulatorStatusEvent) => {
      if (event.emulatorId !== emulatorId) return;
      setStatus(event.status);
      onStatusChange?.(event.status, event.expiresAt);
    });

    socket.on("emulator.expiring", (event: EmulatorExpiringEvent) => {
      if (event.emulatorId !== emulatorId) return;
      setMinutesLeft(event.minutesLeft);
    });

    // keepalive ping ทุก 30 วินาที
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("ping");
      }
    }, 30_000);

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [emulatorId, onStatusChange]);

  return { status, minutesLeft, isConnected };
}

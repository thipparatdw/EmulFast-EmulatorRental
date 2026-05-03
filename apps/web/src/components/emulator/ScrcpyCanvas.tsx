"use client";

import { useCallback, useEffect, useRef } from "react";

// ── Protocol constants ────────────────────────────────────────────────────────
const SCRCPY_INITIAL = new TextEncoder().encode("scrcpy_initial");
const SCRCPY_MESSAGE = new TextEncoder().encode("scrcpy_message");

const NAL_SEI = 6;
const NAL_SPS = 7;
const NAL_PPS = 8;
const NAL_IDR = 5;

// Touch control protocol (scrcpy TYPE_TOUCH = 2)
const TYPE_TOUCH = 2;
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
const BUTTON_PRIMARY = 1;
const MAX_PRESSURE = 65535;

// ── Utilities ─────────────────────────────────────────────────────────────────
function hasPrefix(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}

function concatU8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function buildTouchBuf(
  action: number,
  pointerId: number,
  x: number,
  y: number,
  w: number,
  h: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(28);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, TYPE_TOUCH);       o += 1;
  v.setUint8(o, action);           o += 1;
  v.setUint32(o, 0, false);        o += 4; // pointerId high bits
  v.setUint32(o, pointerId, false);o += 4; // pointerId low bits
  v.setInt32(o, Math.round(x), false); o += 4; // x
  v.setInt32(o, Math.round(y), false); o += 4; // y
  v.setUint16(o, w, false);        o += 2;
  v.setUint16(o, h, false);        o += 2;
  v.setUint16(o, action === ACTION_UP ? 0 : MAX_PRESSURE, false); o += 2;
  v.setUint32(o, action === ACTION_UP ? 0 : BUTTON_PRIMARY, false);
  return buf;
}

// ── Component ─────────────────────────────────────────────────────────────────
export interface ScrcpyCanvasProps {
  websocketUrl: string; // ws://HOST:8000/?action=stream&udid=<encoded>
  className?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFirstFrame?: () => void;
}

export function ScrcpyCanvas({
  websocketUrl,
  className,
  onConnected,
  onDisconnected,
  onFirstFrame,
}: ScrcpyCanvasProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const decoderRef  = useRef<VideoDecoder | null>(null);

  // decoder buffer state
  const bufRef      = useRef<Uint8Array | null>(null);
  const hasSpsRef   = useRef(false);
  const hasPpsRef   = useRef(false);
  const hasIDRRef   = useRef(false);

  // device native resolution (set on first decoded frame)
  const devWRef     = useRef(0);
  const devHRef     = useRef(0);

  // rAF state
  const rafRef      = useRef<number | null>(null);
  const framesRef   = useRef<VideoFrame[]>([]);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    const frame = framesRef.current.shift();
    const canvas = canvasRef.current;
    if (!frame) { rafRef.current = null; return; }

    if (canvas) {
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width  = frame.displayWidth;
        canvas.height = frame.displayHeight;
        devWRef.current = frame.displayWidth;
        devHRef.current = frame.displayHeight;
      }
      canvas.getContext("2d")?.drawImage(frame, 0, 0);
    }
    frame.close();

    if (framesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(drawLoop);
    } else {
      rafRef.current = null;
    }
  }, []);

  // ── NAL unit processor (mirrors WebCodecsPlayer.decode in ws-scrcpy) ───────
  const processNal = useCallback((nal: Uint8Array) => {
    if (nal.length < 5) return;
    const nalType = nal[4] & 0x1f;
    const decoder = decoderRef.current;

    // SPS → configure decoder
    if (nalType === NAL_SPS) {
      const sps = nal.subarray(4); // skip start code; sps[0]=NAL hdr, [1]=profile, [2]=constraints, [3]=level
      const codec = `avc1.${hex2(sps[1])}${hex2(sps[2])}${hex2(sps[3])}`;
      if (decoder && decoder.state !== "closed") {
        decoder.configure({ codec, optimizeForLatency: true });
      }
      bufRef.current   = new Uint8Array(nal); // copy
      hasSpsRef.current = true;
      hasPpsRef.current = false;
      hasIDRRef.current = false;
      return;
    }

    // PPS → buffer
    if (nalType === NAL_PPS) {
      bufRef.current = bufRef.current ? concatU8(bufRef.current, nal) : new Uint8Array(nal);
      hasPpsRef.current = true;
      return;
    }

    if (!decoder || decoder.state !== "configured") return;

    // SEI → skip until SPS+PPS seen
    if (nalType === NAL_SEI && !(hasSpsRef.current && hasPpsRef.current)) return;

    const isIDR = nalType === NAL_IDR;
    const accumulated = bufRef.current ? concatU8(bufRef.current, nal) : new Uint8Array(nal);
    bufRef.current   = accumulated;
    hasIDRRef.current = hasIDRRef.current || isIDR;

    if (hasIDRRef.current) {
      const data = bufRef.current!;
      bufRef.current   = null;
      hasSpsRef.current = false;
      hasPpsRef.current = false;

      try {
        decoder.decode(new EncodedVideoChunk({ type: "key", timestamp: 0, data }));
      } catch (err) {
        console.warn("[ScrcpyCanvas] decode:", err);
      }
    }
  }, []);

  // ── Touch forwarding ───────────────────────────────────────────────────────
  const sendTouch = useCallback((action: number, pid: number, cx: number, cy: number) => {
    const ws     = wsRef.current;
    const canvas = canvasRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !canvas) return;
    if (!devWRef.current || !devHRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((cx - rect.left) / rect.width)  * devWRef.current;
    const y = ((cy - rect.top)  / rect.height) * devHRef.current;
    ws.send(buildTouchBuf(action, pid & 0xffff, x, y, devWRef.current, devHRef.current));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    sendTouch(ACTION_DOWN, e.pointerId, e.clientX, e.clientY);
  }, [sendTouch]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0) return;
    sendTouch(ACTION_MOVE, e.pointerId, e.clientX, e.clientY);
  }, [sendTouch]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    sendTouch(ACTION_UP, e.pointerId, e.clientX, e.clientY);
  }, [sendTouch]);

  // ── WebSocket + VideoDecoder lifecycle ─────────────────────────────────────
  useEffect(() => {
    if (!websocketUrl) return;
    if (typeof VideoDecoder === "undefined") {
      console.warn("[ScrcpyCanvas] WebCodecs VideoDecoder not available");
      return;
    }

    bufRef.current    = null;
    hasSpsRef.current = false;
    hasPpsRef.current = false;
    hasIDRRef.current = false;
    devWRef.current   = 0;
    devHRef.current   = 0;

    let firstFrameFired = false;
    const decoder = new VideoDecoder({
      output: (frame) => {
        framesRef.current.push(frame);
        if (!firstFrameFired) {
          firstFrameFired = true;
          onFirstFrame?.();
        }
        if (!rafRef.current) rafRef.current = requestAnimationFrame(drawLoop);
      },
      error: (err) => console.error("[ScrcpyCanvas] decoder error:", err),
    });
    decoderRef.current = decoder;

    const ws = new WebSocket(websocketUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen  = () => onConnected?.();
    ws.onclose = () => onDisconnected?.();
    ws.onmessage = ({ data }) => {
      if (!(data instanceof ArrayBuffer)) return;
      const u8 = new Uint8Array(data);
      if (hasPrefix(u8, SCRCPY_INITIAL) || hasPrefix(u8, SCRCPY_MESSAGE)) return;
      processNal(u8);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (decoder.state !== "closed") decoder.close();
      decoderRef.current = null;
      framesRef.current.forEach((f) => f.close());
      framesRef.current = [];
    };
  }, [websocketUrl, processNal, drawLoop, onConnected, onDisconnected, onFirstFrame]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none" }}
    />
  );
}

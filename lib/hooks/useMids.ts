"use client";

import { useSyncExternalStore } from "react";
import { HL_DATA_WS_URL } from "@/lib/config";
import { loadStockMap, stockMapNow } from "@/lib/stocks-client";

/**
 * Live mid prices for every coin via the Hyperliquid WebSocket `allMids` feed.
 * One shared socket for the whole app (not one per component), and updates are batched to at most
 * one per second so the page isn't re-rendered on every tick.
 */
let mids: Record<string, number> = {};
let connected = false;
let ws: WebSocket | null = null;
let pending: Record<string, number> | null = null;
let flush: ReturnType<typeof setTimeout> | null = null;
let reconnect: ReturnType<typeof setTimeout> | null = null;
let retry = 0;
const subs = new Set<() => void>();
// Stock perps (HIP-3) stream on their own dex channels with Hyperliquid names ("xyz:NVDA"); we key them by ticker.

const emit = () => subs.forEach((f) => f());

function connect() {
  if (typeof WebSocket === "undefined") return;
  const sock = new WebSocket(HL_DATA_WS_URL);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    connected = true;
    emit();
    sock.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
    void loadStockMap().then(({ dexes }) => {
      if (ws !== sock || sock.readyState !== 1) return;
      for (const dex of dexes) sock.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids", dex } }));
    });
  };
  sock.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      if (msg.channel === "allMids" && msg.data?.mids) {
        const raw = msg.data.mids as Record<string, string>;
        const dexMsg = !!msg.data.dex || Object.keys(raw).some((k) => k.includes(":"));
        // Each channel (native, or one builder dex) carries only its own markets, so merge rather than replace.
        const next: Record<string, number> = { ...(pending ?? mids) };
        if (dexMsg) {
          const map = stockMapNow(); // resolved before any dex subscription was sent
          if (map) for (const [k, v] of Object.entries(raw)) { const t = map.map[k]; if (t) next[t] = Number(v); }
        } else for (const [k, v] of Object.entries(raw)) next[k] = Number(v);
        const first = !Object.keys(mids).length;
        pending = next;
        if (first) { mids = next; pending = null; emit(); return; }
        flush ??= setTimeout(() => { flush = null; if (pending) { mids = pending; pending = null; emit(); } }, 1000);
      }
    } catch {
      /* ignore */
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    connected = false;
    emit();
    if (subs.size && !(typeof document !== "undefined" && document.visibilityState === "hidden")) reconnect = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
  };
  sock.onerror = () => sock.close();
}

// Save battery and data: a tab left in the background for 30s drops the socket; it reconnects (and catches up
// in one message) the moment you come back.
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenTimer ??= setTimeout(() => { hiddenTimer = null; const w = ws; ws = null; connected = false; w?.close(); }, 30_000);
    } else {
      if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
      if (subs.size && !ws) { if (reconnect) { clearTimeout(reconnect); reconnect = null; } retry = 0; connect(); }
    }
  });
}

// Signal back after a dead spot: reconnect now instead of waiting out the retry backoff (up to 10s of frozen prices).
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!subs.size || ws) return;
    if (reconnect) { clearTimeout(reconnect); reconnect = null; }
    retry = 0; connect();
  });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1 && !ws) connect();
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      if (reconnect) clearTimeout(reconnect);
      reconnect = null;
      const w = ws;
      ws = null;
      connected = false;
      w?.close();
    }
  };
}

const EMPTY: Record<string, number> = {};
const getMids = () => mids;
const getConnected = () => connected;

export function useMids() {
  return {
    mids: useSyncExternalStore(subscribe, getMids, () => EMPTY),
    connected: useSyncExternalStore(subscribe, getConnected, () => false),
  };
}

/**
 * One coin's live mid. Re-renders only when that coin's price changes, not on every tick of every market,
 * so a long list (feed, markets) doesn't redraw itself each second.
 */
export function useMid(coin?: string | null): number | undefined {
  return useSyncExternalStore(subscribe, () => (coin ? mids[coin] : undefined), () => undefined);
}

/** Live connection state only (for the "Live" dot); doesn't re-render on price ticks. */
export function useMidsConnected(): boolean {
  return useSyncExternalStore(subscribe, getConnected, () => false);
}

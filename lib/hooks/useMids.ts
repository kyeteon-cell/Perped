"use client";

import { useSyncExternalStore } from "react";
import { HL_DATA_WS_URL } from "@/lib/config";

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
  };
  sock.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      if (msg.channel === "allMids" && msg.data?.mids) {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(msg.data.mids as Record<string, string>)) next[k] = Number(v);
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
    if (subs.size) reconnect = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
  };
  sock.onerror = () => sock.close();
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

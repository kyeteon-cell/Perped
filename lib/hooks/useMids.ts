"use client";

import { useEffect, useRef, useState } from "react";
import { HL_WS_URL } from "@/lib/config";

/** Live mid prices for every coin via the Hyperliquid WebSocket `allMids` feed. */
export function useMids() {
  const [mids, setMids] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const retry = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(HL_WS_URL);
      ws.onopen = () => {
        retry.current = 0;
        setConnected(true);
        ws?.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.channel === "allMids" && msg.data?.mids) {
            const next: Record<string, number> = {};
            for (const [k, v] of Object.entries(msg.data.mids as Record<string, string>)) next[k] = Number(v);
            setMids(next);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(10_000, 500 * 2 ** retry.current++);
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { mids, connected };
}

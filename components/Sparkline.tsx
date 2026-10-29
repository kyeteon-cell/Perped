"use client";

import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";

/** Tiny 24h line for a market row. Loads lazily; renders a flat placeholder until data arrives. */
export function Sparkline({ coin, up }: { coin: string; up: boolean }) {
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?range=1d`, { revalidateOnFocus: false, dedupingInterval: 120_000 });
  const pts = data?.candles?.map((c) => c.c) ?? [];
  const path = toPolyline(pts, 60, 20);
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-[60px]" aria-hidden>
      <polyline points={path || "0,10 60,10"} fill="none" strokeWidth={1.6} strokeLinejoin="round" stroke={pts.length ? (up ? "var(--green)" : "var(--red)") : "var(--line)"} />
    </svg>
  );
}

export function toPolyline(values: number[], w: number, h: number, pad = 1) {
  if (values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - pad - ((v - min) / span) * (h - 2 * pad)).toFixed(1)}`).join(" ");
}

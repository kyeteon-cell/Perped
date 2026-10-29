"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";
import { toPolyline } from "./Sparkline";

type Range = "1h" | "1d" | "1w";

/** Area line chart of closes for a coin with a range switch. Pure SVG, scales to width. */
export function PriceChart({ coin, livePx }: { coin: string; livePx?: number }) {
  const [range, setRange] = useState<Range>("1h");
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?range=${range}`, { refreshInterval: range === "1h" ? 30_000 : 120_000 });
  const closes = data?.candles?.map((c) => c.c) ?? [];
  if (livePx && closes.length) closes[closes.length - 1] = livePx;
  const W = 320, H = 90;
  const line = toPolyline(closes, W, H, 4);
  const up = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : true;
  const color = up ? "var(--green)" : "var(--red)";
  const last = line ? line.split(" ").pop()!.split(",") : null;

  return (
    <div>
      <div className="flex justify-end gap-1">
        {(["1h", "1d", "1w"] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className="pill !px-2 !py-0.5 !text-[11px] uppercase" style={{ background: r === range ? "var(--ink)" : "var(--panel-2)", color: r === range ? "var(--ink-fg)" : "var(--text)" }}>{r}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-[90px] w-full" role="img" aria-label={`${coin} price, last ${range}`}>
        <defs>
          <linearGradient id={`g-${coin}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.22} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {line ? (
          <>
            <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#g-${coin})`} />
            <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
            {last && <circle cx={last[0]} cy={last[1]} r={3} fill={color} />}
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--muted)" fontSize="12">Loading chart…</text>
        )}
      </svg>
    </div>
  );
}

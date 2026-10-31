"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";

/** Tiny 24h line for a market row. Loads lazily; renders a flat placeholder until data arrives. */
export function Sparkline({ coin, up, wide = false }: { coin: string; up: boolean; wide?: boolean }) {
  // Only fetch once the row scrolls near the screen.
  const ref = useRef<SVGSVGElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { data } = useSWR<{ candles: Candle[] }>(vis ? `/api/markets/${coin}/candles?range=1d` : null, { revalidateOnFocus: false, dedupingInterval: 120_000 });
  const W = wide ? 320 : 60, H = wide ? 70 : 20;
  const pts = useMemo(() => data?.candles?.map((c) => c.c) ?? [], [data]);
  const path = useMemo(() => toPolyline(pts, W, H, wide ? 4 : 1), [pts, W, H, wide]);
  const last = path ? path.split(" ").pop()!.split(",") : null;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className={wide ? "h-[70px] w-full" : "h-5 w-[60px]"} aria-hidden>
      <polyline points={path || `0,${H / 2} ${W},${H / 2}`} fill="none" strokeWidth={wide ? 2 : 1.6} strokeLinejoin="round" stroke={pts.length ? (up ? "var(--green)" : "var(--red)") : "var(--line)"} />
      {wide && last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={up ? "var(--green)" : "var(--red)"} />}
    </svg>
  );
}

export function toPolyline(values: number[], w: number, h: number, pad = 1) {
  if (values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - pad - ((v - min) / span) * (h - 2 * pad)).toFixed(1)}`).join(" ");
}

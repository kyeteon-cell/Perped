"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";

type Range = "1h" | "4h" | "1d" | "1w" | "1m";
type Mode = "candles" | "line";
const RANGES: Range[] = ["1h", "4h", "1d", "1w", "1m"];

/**
 * Price chart for a coin: candlesticks (default) or an area line, five ranges, volume bars,
 * price grid, live last candle, and a touch/drag crosshair with an OHLC readout. Pure SVG.
 */
export function PriceChart({ coin, livePx }: { coin: string; livePx?: number }) {
  const [range, setRange] = useState<Range>("1d");
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem("perped-chart") as Mode) || "candles"; } catch { return "candles"; } });
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?range=${range}`, { refreshInterval: range === "1h" ? 15_000 : range === "4h" ? 30_000 : 60_000 });

  const candles = useMemo(() => {
    const cs = (data?.candles ?? []).slice(-120);
    if (livePx && cs.length) {
      // Live-update the last candle from the WebSocket mid so the chart moves between refreshes.
      const l = { ...cs[cs.length - 1] };
      l.c = livePx; l.h = Math.max(l.h, livePx); l.l = Math.min(l.l, livePx);
      cs[cs.length - 1] = l;
    }
    return cs;
  }, [data, livePx]);

  const W = 360, H = 170, VH = 28, PAD_R = 50, PAD_T = 6;
  const plotW = W - PAD_R, plotH = H - VH - PAD_T - 4;
  const n = candles.length;
  const hi = n ? Math.max(...candles.map((c) => c.h)) : 0;
  const lo = n ? Math.min(...candles.map((c) => c.l)) : 0;
  const span = hi - lo || hi * 0.01 || 1;
  const y = (p: number) => PAD_T + ((hi - p) / span) * plotH;
  const step = n ? plotW / n : 0;
  const bw = Math.max(1.5, step * 0.62);
  const vmax = n ? Math.max(...candles.map((c) => c.v)) || 1 : 1;
  const first = candles[0]?.o ?? 0, last = candles[n - 1]?.c ?? 0;
  const up = last >= first;
  const color = up ? "var(--green)" : "var(--red)";
  const closes = candles.map((c) => c.c);
  const line = n > 1 ? closes.map((c, i) => `${(i * step + step / 2).toFixed(1)},${y(c).toFixed(1)}`).join(" ") : "";
  const sel = hover !== null ? candles[Math.min(n - 1, Math.max(0, hover))] : null;
  const shown = sel ?? candles[n - 1];
  const digits = hi >= 1000 ? 0 : hi >= 10 ? 2 : hi >= 1 ? 3 : 5;
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => hi - t * span);

  const pick = (clientX: number) => {
    const el = svgRef.current; if (!el || !n) return;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    setHover(x >= plotW ? null : Math.floor(x / step));
  };
  const setModePersist = (m: Mode) => { setMode(m); try { localStorage.setItem("perped-chart", m); } catch {} };
  const chPct = shown && shown.o ? ((shown.c - shown.o) / shown.o) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="seg">{(["candles", "line"] as Mode[]).map((m) => <button key={m} onClick={() => setModePersist(m)} className={`chip ${m === mode ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}>{m === "candles" ? "Candles" : "Line"}</button>)}</div>
        <div className="flex gap-1">{RANGES.map((r) => <button key={r} onClick={() => { setRange(r); setHover(null); }} className={`chip uppercase ${r === range ? "on" : ""}`} style={{ padding: "6px 9px", fontSize: 12 }}>{r}</button>)}</div>
      </div>

      {shown && (
        <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          <span>{new Date(shown.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span>O <b style={{ color: "var(--text)" }}>{fmt(shown.o)}</b></span>
          <span>H <b style={{ color: "var(--text)" }}>{fmt(shown.h)}</b></span>
          <span>L <b style={{ color: "var(--text)" }}>{fmt(shown.l)}</b></span>
          <span>C <b style={{ color: shown.c >= shown.o ? "var(--green)" : "var(--red)" }}>{fmt(shown.c)}</b> <b style={{ color: shown.c >= shown.o ? "var(--green)" : "var(--red)" }}>{chPct >= 0 ? "+" : ""}{chPct.toFixed(2)}%</b></span>
          <span>Vol <b style={{ color: "var(--text)" }}>{shown.v >= 1e6 ? `${(shown.v / 1e6).toFixed(2)}M` : shown.v >= 1e3 ? `${(shown.v / 1e3).toFixed(1)}K` : shown.v.toFixed(0)}</b></span>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1.5 w-full touch-none select-none"
        style={{ height: 170 }}
        role="img"
        aria-label={`${coin} ${mode}, last ${range}`}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") pick(e.clientX); }}
        onPointerUp={() => setTimeout(() => setHover(null), 1200)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g-${coin}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.22} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {!n && <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--muted)" fontSize="12">Loading chart…</text>}

        {n > 0 && grid.map((g, i) => (
          <g key={i}>
            <line x1={0} x2={plotW} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={0.6} strokeDasharray={i === 0 || i === 4 ? undefined : "2 3"} />
            <text x={plotW + 6} y={y(g) + 3.5} fontSize="9.5" fill="var(--muted)" fontFamily="var(--mono, ui-monospace, monospace)">{fmt(g)}</text>
          </g>
        ))}

        {n > 0 && candles.map((c, i) => {
          const vx = i * step;
          const vh = (c.v / vmax) * (VH - 4);
          return <rect key={`v${i}`} x={vx + (step - bw) / 2} y={H - 4 - vh} width={bw} height={vh} fill={c.c >= c.o ? "var(--green)" : "var(--red)"} opacity={0.28} />;
        })}

        {n > 0 && mode === "line" && line && (
          <>
            <polygon points={`${step / 2},${PAD_T + plotH} ${line} ${plotW - step / 2},${PAD_T + plotH}`} fill={`url(#g-${coin})`} />
            <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          </>
        )}

        {n > 0 && mode === "candles" && candles.map((c, i) => {
          const cx = i * step + step / 2;
          const col = c.c >= c.o ? "var(--green)" : "var(--red)";
          const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={Math.max(0.8, bw * 0.18)} />
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} rx={bw > 4 ? 0.8 : 0} />
            </g>
          );
        })}

        {n > 0 && (
          <g>
            <line x1={0} x2={plotW} y1={y(last)} y2={y(last)} stroke={color} strokeWidth={0.8} strokeDasharray="3 3" />
            <rect x={plotW + 2} y={y(last) - 7} width={PAD_R - 4} height={14} rx={3} fill={color} />
            <text x={plotW + PAD_R / 2} y={y(last) + 3.5} textAnchor="middle" fontSize="9.5" fontWeight={700} fill="#fff" fontFamily="var(--mono, ui-monospace, monospace)">{fmt(last)}</text>
          </g>
        )}

        {sel && hover !== null && (
          <g pointerEvents="none">
            <line x1={hover * step + step / 2} x2={hover * step + step / 2} y1={PAD_T} y2={H - 4} stroke="var(--text)" strokeWidth={0.7} strokeDasharray="2 2" opacity={0.7} />
            <line x1={0} x2={plotW} y1={y(sel.c)} y2={y(sel.c)} stroke="var(--text)" strokeWidth={0.7} strokeDasharray="2 2" opacity={0.7} />
            <rect x={plotW + 2} y={y(sel.c) - 7} width={PAD_R - 4} height={14} rx={3} fill="var(--text)" />
            <text x={plotW + PAD_R / 2} y={y(sel.c) + 3.5} textAnchor="middle" fontSize="9.5" fontWeight={700} fill="var(--bg)" fontFamily="var(--mono, ui-monospace, monospace)">{fmt(sel.c)}</text>
          </g>
        )}
      </svg>
      <p className="faint mt-1 text-[11px]">Hyperliquid mainnet · touch and drag for OHLC</p>
    </div>
  );
}

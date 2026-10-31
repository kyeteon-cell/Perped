"use client";

import Link from "next/link";
import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";

/**
 * Quick-TA strip for a live trade: 24h of 15-minute candles with the entry, live price and TP/SL drawn on,
 * plus the coin's day stats. Candles are shared per coin through SWR, so a feed full of BTC trades makes one request.
 */
export function TradeChart({ coin, entry, mark, side, tp, sl }: { coin: string; entry: number; mark: number; side: "long" | "short"; tp?: number | null; sl?: number | null }) {
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?interval=15m&limit=96`, { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false });
  const { markets } = useMarkets();
  const m = markets.find((x) => x.name === coin);
  const candles = (data?.candles ?? []).slice(-96);
  const live = mark || m?.mid || candles[candles.length - 1]?.c || entry;

  const W = 320, H = 70, PAD = 5;
  const hi = candles.length ? Math.max(...candles.map((c) => c.h)) : live;
  const lo = candles.length ? Math.min(...candles.map((c) => c.l)) : live;
  const span = Math.max(hi - lo, live * 0.002);
  // Keep entry and live price in frame; only pull TP/SL in if they're near the action.
  const near = (p?: number | null) => !!p && p > lo - span * 0.6 && p < hi + span * 0.6;
  const levels = [live, entry, ...(near(tp) ? [tp!] : []), ...(near(sl) ? [sl!] : [])];
  const top = Math.max(hi, ...levels), bot = Math.min(lo, ...levels);
  const rng = Math.max(top - bot, live * 0.002);
  const y = (p: number) => PAD + (1 - (p - bot) / rng) * (H - PAD * 2);
  const pctY = (p: number) => (y(p) / H) * 100;
  const n = Math.max(candles.length, 1), cw = W / n, bw = Math.max(1, cw * 0.62);

  const dayHi = m ? Math.max(hi, live) : hi, dayLo = m ? Math.min(lo, live) : lo;
  const winning = side === "long" ? live >= entry : live <= entry;

  return (
    <Link href={`/markets/${coin}`} className="tchart" onClick={(e) => e.stopPropagation()} aria-label={`${coin} chart`}>
      <div className="tchart-plot">
        {candles.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`tz-${coin}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={winning ? "var(--green)" : "var(--red)"} stopOpacity=".12" />
                <stop offset="1" stopColor={winning ? "var(--green)" : "var(--red)"} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* profit zone between entry and live price */}
            <rect x="0" width={W} y={Math.min(y(entry), y(live))} height={Math.max(1, Math.abs(y(entry) - y(live)))} fill={`url(#tz-${coin})`} />
            {candles.map((c, i) => {
              const up = c.c >= c.o, x = i * cw + cw / 2;
              const col = up ? "var(--green)" : "var(--red)";
              return (
                <g key={c.t}>
                  <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity=".8" />
                  <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(0.8, Math.abs(y(c.o) - y(c.c)))} fill={col} rx="0.4" />
                </g>
              );
            })}
            {near(tp) && <line x1="0" x2={W} y1={y(tp!)} y2={y(tp!)} stroke="var(--green)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".7" />}
            {near(sl) && <line x1="0" x2={W} y1={y(sl!)} y2={y(sl!)} stroke="var(--red)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".7" />}
            <line x1="0" x2={W} y1={y(entry)} y2={y(entry)} stroke="var(--text)" strokeDasharray="4 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".45" />
            <line x1="0" x2={W} y1={y(live)} y2={y(live)} stroke={winning ? "var(--green)" : "var(--red)"} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".9" />
          </svg>
        ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
        {candles.length > 0 && (
          <>
            <span className="tc-tag entry" style={{ top: `${pctY(entry)}%` }}>entry {fmtPrice(entry)}</span>
            <span className={`tc-tag now ${winning ? "g" : "r"}`} style={{ top: `${pctY(live)}%` }}>{fmtPrice(live)}</span>
            <i className={`tc-dot ${winning ? "g" : "r"}`} style={{ top: `${pctY(live)}%` }} />
            {near(tp) && <span className="tc-tag tp" style={{ top: `${pctY(tp!)}%` }}>TP</span>}
            {near(sl) && <span className="tc-tag sl" style={{ top: `${pctY(sl!)}%` }}>SL</span>}
          </>
        )}
        <span className="tc-range">24h · 15m</span>
      </div>
      <div className="tstats">
        <div><small>24h</small><b className={`mono ${(m?.change24h ?? 0) >= 0 ? "green" : "red"}`}>{m ? fmtPct(m.change24h, 2) : "—"}</b></div>
        <div><small>High / Low</small><b className="mono">{candles.length ? `${fmtPrice(dayHi)} / ${fmtPrice(dayLo)}` : "—"}</b></div>
        <div><small>Volume</small><b className="mono">{m ? fmtUsd(m.volume24h, { compact: true }) : "—"}</b></div>
        <div><small>Funding</small><b className={`mono ${(m?.funding8h ?? 0) >= 0 ? "" : "red"}`}>{m ? `${m.funding8h >= 0 ? "+" : ""}${m.funding8h.toFixed(4)}%` : "—"}</b></div>
      </div>
    </Link>
  );
}

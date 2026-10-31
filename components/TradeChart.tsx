"use client";

import Link from "next/link";
import useSWR from "swr";
import type { Candle } from "@/lib/hl-info";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";

type Props = { coin: string; entry: number; mark: number; side: "long" | "short"; lev: number; openedAt?: string | Date | null; tp?: number | null; sl?: number | null };

/**
 * Quick-TA block for a live trade: a compact candle chart framed around the trade (entry marker, live price,
 * TP/SL, shaded P&L zone), a trade box beside it, and the coin's day stats underneath.
 * Candle requests are keyed per coin + interval, so a feed full of BTC trades shares one request.
 */
export function TradeChart({ coin, entry, mark, side, lev, openedAt, tp, sl }: Props) {
  const opened = openedAt ? new Date(openedAt).getTime() : Date.now();
  const age = Date.now() - opened;
  // Frame the chart on the trade: fresh trades get 1m candles, older ones zoom out.
  const [iv, ms, limit] = age < 50 * 60_000 ? ["1m", 60_000, 60] : age < 5 * 3_600_000 ? ["5m", 300_000, 72] : age < 20 * 3_600_000 ? ["15m", 900_000, 96] : ["1h", 3_600_000, 72];
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?interval=${iv}&limit=${limit}`, { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false });
  const { markets } = useMarkets();
  const m = markets.find((x) => x.name === coin);
  const candles = (data?.candles ?? []).slice(-limit);
  const live = mark || m?.mid || candles[candles.length - 1]?.c || entry;

  const winning = side === "long" ? live >= entry : live <= entry;
  const move = entry ? ((live - entry) / entry) * 100 : 0;
  const liq = lev > 1 ? (side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev)) : null;

  const W = 200, H = 80, PAD = 6, RIGHT = 8;
  const hi = candles.length ? Math.max(...candles.map((c) => c.h)) : live;
  const lo = candles.length ? Math.min(...candles.map((c) => c.l)) : live;
  const span = Math.max(hi - lo, live * 0.002);
  const near = (p?: number | null) => !!p && p > lo - span * 0.5 && p < hi + span * 0.5;
  const levels = [live, entry, ...(near(tp) ? [tp!] : []), ...(near(sl) ? [sl!] : [])];
  const top = Math.max(hi, ...levels), bot = Math.min(lo, ...levels);
  const rng = Math.max(top - bot, live * 0.002);
  const y = (p: number) => PAD + (1 - (p - bot) / rng) * (H - PAD * 2);
  const n = Math.max(candles.length, 1), cw = (W - RIGHT) / n, bw = Math.max(1, cw * 0.6);
  // x of the candle the trade was opened in (clamped to the left edge if it's older than the window)
  const t0 = candles[0]?.t ?? opened;
  const ei = Math.max(0, Math.min(n - 1, Math.floor((opened - t0) / ms)));
  const ex = ei * cw + cw / 2;
  const ey = y(entry), ly = y(live);
  const zone = winning ? "var(--green)" : "var(--red)";

  return (
    <Link href={`/markets/${coin}`} className="tchart" onClick={(e) => e.stopPropagation()} aria-label={`${coin} chart`}>
      <div className="tc-grid">
        <div className="tchart-plot">
          {candles.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              {/* P&L zone: from the entry candle to now, between entry and live price */}
              <rect x={ex} width={W - ex} y={Math.min(ey, ly)} height={Math.max(1, Math.abs(ey - ly))} fill={zone} opacity=".14" />
              {candles.map((c, i) => {
                const up = c.c >= c.o, x = i * cw + cw / 2, col = up ? "var(--green)" : "var(--red)";
                const before = i < ei;
                return (
                  <g key={c.t} opacity={before ? 0.35 : 1}>
                    <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(0.8, Math.abs(y(c.o) - y(c.c)))} fill={col} />
                  </g>
                );
              })}
              {near(tp) && <line x1={ex} x2={W} y1={y(tp!)} y2={y(tp!)} stroke="var(--green)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              {near(sl) && <line x1={ex} x2={W} y1={y(sl!)} y2={y(sl!)} stroke="var(--red)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              <line x1={ex} x2={ex} y1="0" y2={H} stroke="var(--text)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".35" />
              <line x1={ex} x2={W} y1={ey} y2={ey} stroke="var(--text)" strokeDasharray="4 3" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity=".7" />
              <line x1={ex} x2={W} y1={ly} y2={ly} stroke={zone} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            </svg>
          ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
          {candles.length > 0 && (
            <>
              <i className="tc-in" style={{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%` }}><b>{side === "long" ? "▲" : "▼"}</b></i>
              <i className={`tc-dot ${winning ? "g" : "r"}`} style={{ top: `${(ly / H) * 100}%` }} />
            </>
          )}
          <span className="tc-range">{iv}</span>
        </div>
        <div className="tc-box">
          <div><small>Entry</small><b className="mono">{fmtPrice(entry)}</b></div>
          <div><small>Now</small><b className={`mono ${winning ? "green" : "red"}`}>{fmtPrice(live)} <em>{move >= 0 ? "+" : ""}{move.toFixed(2)}%</em></b></div>
          {tp ? <div><small>Take profit</small><b className="mono green">{fmtPrice(tp)}</b></div> : liq ? <div><small>Liq ≈</small><b className="mono">{fmtPrice(liq)}</b></div> : null}
          {sl ? <div><small>Stop loss</small><b className="mono red">{fmtPrice(sl)}</b></div> : tp && liq ? <div><small>Liq ≈</small><b className="mono">{fmtPrice(liq)}</b></div> : null}
        </div>
      </div>
      <div className="tstats">
        <div><small>24h</small><b className={`mono ${(m?.change24h ?? 0) >= 0 ? "green" : "red"}`}>{m ? fmtPct(m.change24h, 2) : "—"}</b></div>
        <div><small>Range</small><b className="mono">{candles.length ? `${fmtPrice(Math.max(hi, live))} / ${fmtPrice(Math.min(lo, live))}` : "—"}</b></div>
        <div><small>Volume</small><b className="mono">{m ? fmtUsd(m.volume24h, { compact: true }) : "—"}</b></div>
        <div><small>Funding</small><b className={`mono ${(m?.funding8h ?? 0) >= 0 ? "" : "red"}`}>{m ? `${m.funding8h >= 0 ? "+" : ""}${m.funding8h.toFixed(4)}%` : "—"}</b></div>
      </div>
    </Link>
  );
}

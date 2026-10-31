"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useState, type MouseEvent } from "react";
import type { Candle } from "@/lib/hl-info";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";

type Iv = "1m" | "5m" | "15m" | "1h";
const IVS: Record<Iv, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000 };

type Props = { coin: string; entry: number; mark: number; side: "long" | "short"; lev: number; openedAt?: string | Date | null; tp?: number | null; sl?: number | null };

/**
 * Quick-TA block for a live trade: a compact candle chart framed around the trade (entry marker, live price,
 * TP/SL, shaded P&L zone), a trade box beside it, and the coin's day stats underneath.
 * Candle requests are keyed per coin + interval, so a feed full of BTC trades shares one request.
 */
export function TradeChart({ coin, entry, mark, side, lev, openedAt, tp, sl }: Props) {
  const opened = openedAt ? new Date(openedAt).getTime() : Date.now();
  // Interval is a quick switch on the card (remembered across cards); 5m by default.
  const [iv, setIv] = useState<Iv>("5m");
  useEffect(() => { try { const v = localStorage.getItem("perped:tc-iv") as Iv | null; if (v && IVS[v]) setIv(v); } catch {} }, []);
  const pick = (e: MouseEvent, v: Iv) => { e.preventDefault(); e.stopPropagation(); setIv(v); try { localStorage.setItem("perped:tc-iv", v); } catch {} };
  const ms = IVS[iv], limit = 40;
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?interval=${iv}&limit=${limit}`, { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false });
  const { markets } = useMarkets();
  const m = markets.find((x) => x.name === coin);
  const candles = (data?.candles ?? []).slice(-limit);
  const live = mark || m?.mid || candles[candles.length - 1]?.c || entry;

  // Two different colour meanings, kept apart on purpose:
  //   market colour = is the PRICE up or down since entry (green up, red down), whatever side you took
  //   action colour = BUY (long, green) or SELL (short, red) at the entry marker
  // Your own P&L colour lives only in the pill at the top of the card.
  const priceUp = live >= entry;
  const mkt = priceUp ? "var(--green)" : "var(--red)";
  const act = side === "long" ? "var(--green)" : "var(--red)";
  const move = entry ? ((live - entry) / entry) * 100 : 0;
  const liq = lev > 1 ? (side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev)) : null;
  const liqDist = liq ? Math.abs((live - liq) / live) * 100 : null;

  const W = 200, H = 80, PAD = 6, RIGHT = 8;
  const hi = candles.length ? Math.max(...candles.map((c) => c.h)) : live;
  const lo = candles.length ? Math.min(...candles.map((c) => c.l)) : live;
  // Frame on candles + entry + live so the candles fill the box; TP / SL / liq only stretch it a little,
  // anything further away is pinned to the edge as a labelled chip.
  const fTop = Math.max(hi, live, entry), fBot = Math.min(lo, live, entry);
  const fSpan = Math.max(fTop - fBot, live * 0.0015);
  const near = (p?: number | null) => !!p && p <= fTop + fSpan * 0.35 && p >= fBot - fSpan * 0.35;
  const levels = [fTop, fBot, ...[tp, sl, liq].filter((p) => near(p)) as number[]];
  const pad = fSpan * 0.08;
  const top = Math.max(...levels) + pad, bot = Math.min(...levels) - pad;
  const rng = Math.max(top - bot, live * 0.0015);
  const y = (p: number) => PAD + (1 - (p - bot) / rng) * (H - PAD * 2);
  const pct = (p: number) => `${(y(p) / H) * 100}%`;
  const n = Math.max(candles.length, 1), cw = (W - RIGHT) / n, bw = Math.max(1.4, cw * 0.68);
  const t0 = candles[0]?.t ?? opened;
  const ei = Math.max(0, Math.min(n - 1, Math.floor((opened - t0) / ms)));
  const ex = ei * cw + cw / 2;
  const ey = y(entry), ly = y(live);
  type Lvl = { key: string; label: string; p: number; cls: string };
  const lvls: Lvl[] = [
    ...(tp ? [{ key: "tp", label: "TP", p: tp, cls: "tp" }] : []),
    ...(sl ? [{ key: "sl", label: "SL", p: sl, cls: "sl" }] : []),
    ...(liq ? [{ key: "liq", label: "LIQ", p: liq, cls: "liq" }] : []),
  ];
  const off = lvls.filter((l) => !near(l.p));
  const offUp = off.filter((l) => l.p > top), offDn = off.filter((l) => l.p < bot);

  return (
    <Link href={`/markets/${coin}`} className="tchart" onClick={(e) => e.stopPropagation()} aria-label={`${coin} chart`}>
      <div className="tc-grid">
        <div className="tchart-plot">
          {candles.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              {candles.map((c, i) => {
                const up = c.c >= c.o, x = i * cw + cw / 2, col = up ? "var(--green)" : "var(--red)";
                return (
                  <g key={c.t} opacity={i < ei ? 0.5 : 1}>
                    <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))} fill={col} />
                  </g>
                );
              })}
              {lvls.filter((l) => near(l.p)).map((l) => (
                <line key={l.key} x1="0" x2={W} y1={y(l.p)} y2={y(l.p)} stroke={l.cls === "tp" ? "var(--green)" : l.cls === "sl" ? "var(--red)" : "var(--text)"} strokeDasharray={l.cls === "liq" ? "1 3" : "4 3"} strokeWidth={l.cls === "liq" ? 1.6 : 1.1} vectorEffect="non-scaling-stroke" opacity=".9" />
              ))}
              <line x1={ex} x2={ex} y1="0" y2={H} stroke={act} strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".5" />
              <line x1={ex} x2={W} y1={ey} y2={ey} stroke={act} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
              <line x1="0" x2={W} y1={ly} y2={ly} stroke={mkt} strokeDasharray="1 2" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".8" />
            </svg>
          ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
          {candles.length > 0 && (
            <>
              {lvls.filter((l) => near(l.p)).map((l) => <span key={l.key} className={`tc-lv ${l.cls}`} style={{ top: pct(l.p) }}>{l.label}</span>)}
              <span className={`tc-act ${side}`} style={{ top: pct(entry) }}>{side === "long" ? "▲ BUY" : "▼ SELL"}</span>
              <i className={`tc-dot ${priceUp ? "g" : "r"}`} style={{ top: pct(live) }} />
            </>
          )}
          {offUp.length > 0 && <span className="tc-edges up">{offUp.map((l) => <b key={l.key} className={l.cls}>{l.label} ↑</b>)}</span>}
          {offDn.length > 0 && <span className="tc-edges down">{offDn.map((l) => <b key={l.key} className={l.cls}>{l.label} ↓</b>)}</span>}
          <span className="tc-ivs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            {(Object.keys(IVS) as Iv[]).map((v) => <button key={v} type="button" className={v === iv ? "on" : ""} onClick={(e) => pick(e, v)}>{v}</button>)}
          </span>
        </div>
        <div className="tc-box">
          <div className="now"><small>Price now</small><b className={`mono ${priceUp ? "green" : "red"}`}>{fmtPrice(live)} <em>{move >= 0 ? "▲ +" : "▼ "}{move.toFixed(2)}%</em></b></div>
          <div><small className={side === "long" ? "green" : "red"}>{side === "long" ? "Bought at" : "Sold at"}</small><b className="mono">{fmtPrice(entry)}</b></div>
          {liq && <div><small>Liq ≈ <span className="faint">{liqDist!.toFixed(0)}% away</span></small><b className="mono">{fmtPrice(liq)}</b></div>}
          {tp ? <div><small className="green">Take profit</small><b className="mono">{fmtPrice(tp)}</b></div> : null}
          {sl ? <div><small className="red">Stop loss</small><b className="mono">{fmtPrice(sl)}</b></div> : null}
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

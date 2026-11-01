"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useEffect, useRef, useState, type MouseEvent } from "react";
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
  const router = useRouter();
  const opened = openedAt ? new Date(openedAt).getTime() : Date.now();
  // Interval is a quick switch on the card (remembered across cards); 5m by default.
  const [iv, setIv] = useState<Iv>("5m");
  useEffect(() => { try { const v = localStorage.getItem("perped:tc-iv") as Iv | null; if (v && IVS[v]) setIv(v); } catch {} }, []);
  const pick = (e: MouseEvent, v: Iv) => { e.preventDefault(); e.stopPropagation(); setIv(v); try { localStorage.setItem("perped:tc-iv", v); } catch {} };
  const ms = IVS[iv], limit = 40;
  // Only fetch candles once the card scrolls near the screen: a long feed doesn't fire a request per trade up front.
  const box = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { data } = useSWR<{ candles: Candle[] }>(vis ? `/api/markets/${coin}/candles?interval=${iv}&limit=${limit}` : null, { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false });
  const { markets } = useMarkets();
  const m = markets.find((x) => x.name === coin);
  const candles = (data?.candles ?? []).slice(-limit);
  const live = mark || m?.mid || candles[candles.length - 1]?.c || entry;

  // Price colour (the "Price now" number) follows the market; the chart zones and live dot follow YOUR P&L.
  const priceUp = live >= entry;
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
  const n = Math.max(candles.length, 1);
  const t0 = candles[0]?.t ?? opened;
  const ei = Math.max(0, Math.min(n - 1, Math.floor((opened - t0) / ms)));
  // Layout: grey history before the entry takes at most 45% of the width, the trade fills the middle in colour,
  // and the last 24% is open space ahead of "now", split into the profit and loss zones.
  const FUT = W * 0.24, room = W - RIGHT - FUT;
  const histN = Math.min(ei, n), liveN = Math.max(1, n - histN);
  const histW = histN ? Math.min(W * 0.45, (room * histN) / n) : 0, liveW = room - histW;
  const xOf = (i: number) => (i < histN ? (i + 0.5) * (histW / histN) : histW + (i - histN + 0.5) * (liveW / liveN));
  const bwOf = (i: number) => Math.max(1.2, (i < histN ? histW / histN : liveW / liveN) * 0.66);
  const ex = histW, nowX = histW + liveW;
  const pctX = (x: number) => `${Math.max(6, Math.min(94, (x / W) * 100))}%`;
  const ey = y(entry), ly = y(live);
  // P&L colour (yours): green when the trade is winning, red when it's losing.
  const winning = side === "long" ? live >= entry : live <= entry;
  const pc = winning ? "var(--green)" : "var(--red)";
  // Danger band: from your stop loss to liquidation (or past liquidation when there's no stop), on the losing side.
  const lossSide = (p: number) => (side === "long" ? p < entry : p > entry);
  const stopP = sl && lossSide(sl) ? sl : null;
  const danger: [number, number] | null = stopP && liq && near(liq) ? [y(stopP), y(liq)] : stopP && near(stopP) ? [y(stopP), side === "long" ? H : 0] : liq && near(liq) ? [y(liq), side === "long" ? H : 0] : null;
  type Lvl = { key: string; label: string; p: number; cls: string };
  const lvls: Lvl[] = [
    ...(tp ? [{ key: "tp", label: "TP", p: tp, cls: "tp" }] : []),
    ...(sl ? [{ key: "sl", label: "SL", p: sl, cls: "sl" }] : []),
    ...(liq ? [{ key: "liq", label: "LIQ", p: liq, cls: "liq" }] : []),
  ];
  const off = lvls.filter((l) => !near(l.p));
  const offUp = off.filter((l) => l.p > top), offDn = off.filter((l) => l.p < bot);

  return (
    <div ref={box} role="link" tabIndex={0} className="tchart" aria-label={`${coin} chart`}
      onClick={(e) => { e.stopPropagation(); router.push(`/markets/${coin}`); }}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/markets/${coin}`); }}>
      <div className="tc-grid">
        <div className="tchart-plot">
          {candles.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              {candles.map((c, i) => {
                const up = c.c >= c.o, x = xOf(i), bw = bwOf(i), col = i < ei ? "var(--muted)" : up ? "var(--green)" : "var(--red)";
                return (
                  <g key={c.t} opacity={i < ei ? 0.4 : 1}>
                    <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))} fill={col} />
                  </g>
                );
              })}
              {/* Win / lose zones from the entry on: your winning side faint green, losing side faint red,
                  the gap between entry and now strong in your P&L colour, and stop-loss → liquidation as a danger band. */}
              <rect x={ex} y="0" width={W - ex} height={ey} fill={side === "long" ? "var(--green)" : "var(--red)"} opacity=".07" />
              <rect x={ex} y={ey} width={W - ex} height={Math.max(0, H - ey)} fill={side === "long" ? "var(--red)" : "var(--green)"} opacity=".07" />
              {danger && <rect x={ex} y={Math.min(danger[0], danger[1])} width={W - ex} height={Math.abs(danger[0] - danger[1])} fill="var(--red)" opacity=".18" />}
              <rect x={ex} y={Math.min(ey, ly)} width={Math.max(0, nowX - ex)} height={Math.max(1, Math.abs(ey - ly))} fill={pc} opacity=".3" />
              <line x1={nowX} x2={nowX} y1="0" y2={H} stroke="var(--text)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".18" />
            </svg>
          ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
          {candles.length > 0 && (
            <>
              {lvls.filter((l) => near(l.p)).map((l) => <span key={l.key} className={`tc-lv ${l.cls}`} style={{ top: pct(l.p) }}>{l.label}</span>)}
              <span className={`tc-act ${side}`} style={{ top: pct(entry), left: pctX(ex) }}>{side === "long" ? "▲ BUY" : "▼ SELL"}</span>
              <i className={`tc-dot ${winning ? "g" : "r"}`} style={{ top: pct(live), left: `${(nowX / W) * 100}%`, right: "auto" }} />
              <span className={`tc-zl up ${side === "long" ? "g" : "r"}`}>{side === "long" ? "profit" : "loss"}</span>
              <span className={`tc-zl down ${side === "long" ? "r" : "g"}`}>{side === "long" ? "loss" : "profit"}</span>
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
    </div>
  );
}

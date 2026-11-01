"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Candle } from "@/lib/hl-info";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fmtPct, fmtPrice } from "@/lib/format";

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
  // Zoom on the trade: keep only a short run of history before the entry (never more than the trade itself, 4–10 candles),
  // so the price scale is set by the trade, not by an old high or low.
  const all = (data?.candles ?? []).slice(-limit);
  const allEi = Math.max(0, Math.min(Math.max(all.length, 1) - 1, Math.floor((opened - (all[0]?.t ?? opened)) / ms)));
  const candles = all.slice(Math.max(0, allEi - Math.max(4, Math.min(10, all.length - allEi))));
  const live = mark || m?.mid || candles[candles.length - 1]?.c || entry;

  // Price colour (the "Price now" number) follows the market; the chart zones and live dot follow YOUR P&L.
  const liq = lev > 1 ? (side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev)) : null;
  const liqDist = liq ? Math.abs((live - liq) / live) * 100 : null;

  const W = 200, H = 100, PAD = 7, AXIS = 42, PLOT = W - AXIS, RIGHT = AXIS + 4;
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
  // Layout: grey history before the entry takes at most 30% of the width, the trade fills the middle in colour,
  // and the last 24% is open space ahead of "now", split into the profit and loss zones.
  const FUT = W * 0.24, room = W - RIGHT - FUT;
  const histN = Math.min(ei, n), liveN = Math.max(1, n - histN);
  const histW = histN ? Math.min(W * 0.3, (room * histN) / n) : 0, liveW = room - histW;
  const xOf = (i: number) => (i < histN ? (i + 0.5) * (histW / histN) : histW + (i - histN + 0.5) * (liveW / liveN));
  const bwOf = (i: number) => Math.max(1.2, (i < histN ? histW / histN : liveW / liveN) * 0.66);
  const ex = histW, nowX = histW + liveW;
  // Price tags on the right edge (like an exchange): now, entry, and stop / take profit / liquidation when they're on screen.
  type Tag = { key: string; p: number; label: string; cls: string; color: string };
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
  const tags: Tag[] = [
    { key: "now", p: live, label: fmtPrice(live), cls: winning ? "now g" : "now r", color: pc },
    { key: "entry", p: entry, label: fmtPrice(entry), cls: "entry", color: "var(--muted)" },
    ...lvls.filter((l) => near(l.p)).map((l) => ({ key: l.key, p: l.p, label: `${l.label} ${fmtPrice(l.p)}`, cls: l.cls, color: l.cls === "tp" ? "var(--green)" : l.cls === "sl" ? "var(--red)" : "var(--text)" })),
  ];
  // Keep tags from overlapping: walk them top to bottom and push each one down past the last.
  const GAP = 17; // percent of the chart height per tag
  const placed = tags.map((t) => ({ ...t, top: (y(t.p) / H) * 100 })).sort((a, b) => a.top - b.top);
  for (let i = 0; i < placed.length; i++) placed[i].top = Math.max(placed[i].top, i ? placed[i - 1].top + GAP : 8);
  for (let i = placed.length - 1; i >= 0; i--) placed[i].top = Math.min(placed[i].top, i < placed.length - 1 ? placed[i + 1].top - GAP : 92);

  return (
    <div ref={box} role="link" tabIndex={0} className="tchart" aria-label={`${coin} chart`}
      onClick={(e) => { e.stopPropagation(); router.push(`/markets/${coin}`); }}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/markets/${coin}`); }}>
      <div className="tchart-plot v2">
        {candles.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {/* Win / lose zones from the entry on: your winning side faint green, losing side faint red,
                the gap between entry and now strong in your P&L colour, and stop-loss → liquidation as a danger band. */}
            <rect x={ex} y="0" width={PLOT - ex} height={ey} fill={side === "long" ? "var(--green)" : "var(--red)"} opacity=".08" />
            <rect x={ex} y={ey} width={PLOT - ex} height={Math.max(0, H - ey)} fill={side === "long" ? "var(--red)" : "var(--green)"} opacity=".08" />
            {danger && <rect x={ex} y={Math.min(danger[0], danger[1])} width={PLOT - ex} height={Math.abs(danger[0] - danger[1])} fill="var(--red)" opacity=".16" />}
            <rect x={ex} y={Math.min(ey, ly)} width={Math.max(0, nowX - ex)} height={Math.max(1, Math.abs(ey - ly))} fill={pc} opacity=".28" />
            {candles.map((c, i) => {
              const up = c.c >= c.o, x = xOf(i), bw = bwOf(i), col = i < ei ? "var(--muted)" : up ? "var(--green)" : "var(--red)";
              return (
                <g key={c.t} opacity={i < ei ? 0.45 : 1}>
                  <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))} fill={col} rx="0.4" />
                </g>
              );
            })}
            {/* Thin guides from the chart to each price tag on the right edge. */}
            {tags.map((t) => <line key={t.key} x1={t.key === "now" ? nowX : ex} x2={PLOT} y1={y(t.p)} y2={y(t.p)} stroke={t.color} strokeWidth="1" strokeDasharray={t.key === "now" ? "" : "2 3"} vectorEffect="non-scaling-stroke" opacity={t.key === "now" ? 0.9 : 0.5} />)}
            <line x1={PLOT} x2={PLOT} y1="0" y2={H} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
        {candles.length > 0 && (
          <>
            <span className={`tc-act ${side}`} style={{ top: pct(entry), left: pctX(ex) }}>{side === "long" ? "BUY" : "SELL"}</span>
            <i className={`tc-dot ${winning ? "g" : "r"}`} style={{ top: `clamp(9px, ${pct(live)}, calc(100% - 9px))`, left: `${(nowX / W) * 100}%`, right: "auto" }} />
            {placed.map((t) => <span key={t.key} className={`tc-tag ${t.cls}`} style={{ top: `${t.top}%` }}>{t.label}</span>)}
          </>
        )}
        {offUp.length > 0 && <span className="tc-edges up">{offUp.map((l) => <b key={l.key} className={l.cls}>{l.label} ↑</b>)}</span>}
        {offDn.length > 0 && <span className="tc-edges down">{offDn.map((l) => <b key={l.key} className={l.cls}>{l.label} ↓</b>)}</span>}
      </div>
      <div className="tc-foot">
        <span className="when truncate">
          {liq ? <>Liq <b className="mono">{fmtPrice(liq)}</b> · {liqDist!.toFixed(0)}% away</> : "No liquidation at 1×"}
          {m ? <> · 24h <b className={`mono ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</b></> : null}
        </span>
        <span className="tc-ivs v2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {(Object.keys(IVS) as Iv[]).map((v) => <button key={v} type="button" className={v === iv ? "on" : ""} onClick={(e) => pick(e, v)}>{v}</button>)}
        </span>
      </div>
    </div>
  );
}

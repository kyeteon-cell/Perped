"use client";

import useSWR from "swr";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Candle } from "@/lib/hl-info";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { Avatar } from "./ui";

export type Fighter = {
  handle: string; avatarUrl: string | null;
  side: "long" | "short"; lev: number; entry: number;
  tp?: number | null; sl?: number | null; openedAt?: string | Date | null;
  margin?: number | null; roi: number;
};

type Iv = "1m" | "5m" | "15m" | "1h";
const IVS: Record<Iv, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000 };
const GREEN = "var(--green)", RED = "var(--red)";

export const liqOf = (f: Fighter) => (f.lev > 1 ? (f.side === "long" ? f.entry * (1 - 1 / f.lev) : f.entry * (1 + 1 / f.lev)) : null);
/** The price that ends this fighter's battle: their stop loss if it sits between entry and liquidation, otherwise liquidation. */
export function stopOf(f: Fighter): { p: number | null; kind: "SL" | "LIQ" | "LOCKED" | null } {
  const liq = liqOf(f), sl = f.sl ?? null;
  if (sl) {
    const lossSide = f.side === "long" ? sl < f.entry : sl > f.entry;
    if (!lossSide) return { p: sl, kind: "LOCKED" }; // stop already in profit: can't lose this one
    const beforeLiq = !liq || (f.side === "long" ? sl > liq : sl < liq);
    if (beforeLiq) return { p: sl, kind: "SL" };
  }
  return liq ? { p: liq, kind: "LIQ" } : { p: null, kind: null };
}
/** Health: 100% at entry or better, 0% at the stop loss (or liquidation when there is no stop). */
export function healthOf(f: Fighter, live: number) {
  const { p, kind } = stopOf(f); if (!p || kind === "LOCKED") return 1;
  const h = f.side === "long" ? (live - p) / (f.entry - p) : (p - live) / (p - f.entry);
  return Math.max(0, Math.min(1, h));
}
const sideCol = (f: Fighter) => (f.side === "long" ? GREEN : RED);
const ts = (d?: string | Date | null) => (d ? new Date(d).getTime() : Date.now());

function useIv(): [Iv, (e: MouseEvent, v: Iv) => void] {
  const [iv, setIv] = useState<Iv>("5m");
  useEffect(() => { try { const v = localStorage.getItem("perped:tc-iv") as Iv | null; if (v && IVS[v]) setIv(v); } catch {} }, []);
  return [iv, (e, v) => { e.preventDefault(); e.stopPropagation(); setIv(v); try { localStorage.setItem("perped:tc-iv", v); } catch {} }];
}

function useCandles(coin: string, iv: Iv, limit = 48) {
  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?interval=${iv}&limit=${Math.max(50, limit)}`, { refreshInterval: 30_000, dedupingInterval: 15_000, revalidateOnFocus: false });
  return (data?.candles ?? []).slice(-limit);
}

/* ======================================================================
   Arena: the battle page's head-to-head block (health bars, chart / race tabs, tale of the tape)
   ====================================================================== */
export function BattleArena({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const [tab, setTab] = useState<"arena" | "race">("arena");
  return (
    <section className="arena">
      <div className="ar-hp">
        <Hp f={a} live={live} />
        <Hp f={b} live={live} right />
      </div>
      <div className="ar-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "arena"} className={tab === "arena" ? "on" : ""} onClick={() => setTab("arena")}>Arena</button>
        <button role="tab" aria-selected={tab === "race"} className={tab === "race" ? "on" : ""} onClick={() => setTab("race")}>P&amp;L race</button>
      </div>
      {tab === "arena" ? <ArenaChart coin={coin} live={live} a={a} b={b} /> : <RaceChart coin={coin} live={live} a={a} b={b} />}
      <Tape a={a} b={b} />
    </section>
  );
}

function Hp({ f, live, right }: { f: Fighter; live: number; right?: boolean }) {
  const h = healthOf(f, live), liq = liqOf(f), stop = stopOf(f);
  const liqDist = liq ? Math.abs((live - liq) / live) * 100 : null;
  const slDist = f.sl ? Math.abs((live - f.sl) / live) * 100 : null;
  const danger = h < 0.35;
  const bleed = h < 0.4;
  const foot = stop.kind === "SL" ? `SL ${slDist!.toFixed(1)}% away${liqDist !== null ? ` · Liq ${liqDist.toFixed(1)}%` : ""}`
    : stop.kind === "LOCKED" ? `SL in profit at ${fmtPrice(f.sl!)}`
    : liqDist !== null ? `Liq ${liqDist.toFixed(1)}% away · no SL` : "No liquidation at 1× · no SL";
  const w = `${Math.max(3, h * 100)}%`;
  return (
    <div className={`ar-hpbox ${right ? "r" : ""}`}>
      <div className="ar-hphead"><span>Margin/SL health</span><b style={{ color: danger || bleed ? "var(--red)" : sideCol(f) }}>{Math.round(h * 100)}%</b></div>
      <div className={`ar-hpbar ${bleed ? "bleed" : ""}`}>
        <div className="ar-hptrack"><i className={f.side} style={{ width: w }} /></div>
        {bleed && <div className="ar-drips" style={{ width: w }} aria-hidden="true"><b /><b /><b /><b /></div>}
      </div>
      <div className="ar-hpfoot">{foot}</div>
    </div>
  );
}

function ArenaChart({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const [iv, pick] = useIv();
  const candles = useCandles(coin, iv, 36);
  const px = live || candles[candles.length - 1]?.c || a.entry;
  // Candles fill the left 70%; the right 30% is open space for the next move, split into who wins where.
  const W = 300, H = 220, PAD = 10, CA = 210;
  const hi = candles.length ? Math.max(...candles.map((c) => c.h)) : px;
  const lo = candles.length ? Math.min(...candles.map((c) => c.l)) : px;
  const fTop = Math.max(hi, px, a.entry, b.entry), fBot = Math.min(lo, px, a.entry, b.entry);
  const fSpan = Math.max(fTop - fBot, px * 0.002);
  const near = (p?: number | null) => !!p && p <= fTop + fSpan * 0.35 && p >= fBot - fSpan * 0.35;

  type Lv = { key: string; f: Fighter; kind: "TP" | "SL" | "LIQ"; p: number };
  const lv: Lv[] = [];
  for (const [k, f] of [["a", a], ["b", b]] as const) {
    if (f.tp) lv.push({ key: `${k}tp`, f, kind: "TP", p: f.tp });
    if (f.sl) lv.push({ key: `${k}sl`, f, kind: "SL", p: f.sl });
    const l = liqOf(f); if (l) lv.push({ key: `${k}liq`, f, kind: "LIQ", p: l });
  }
  const inLv = lv.filter((l) => near(l.p)), offLv = lv.filter((l) => !near(l.p));
  const all = [fTop, fBot, ...inLv.map((l) => l.p)];
  const pad = fSpan * 0.12;
  const top = Math.max(...all) + pad, bot = Math.min(...all) - pad;
  const rng = Math.max(top - bot, px * 0.002);
  const y = (p: number) => PAD + (1 - (p - bot) / rng) * (H - PAD * 2);
  const pctY = (p: number) => `${(y(p) / H) * 100}%`;
  const pctX = (x: number) => `${(x / W) * 100}%`;
  const n = Math.max(candles.length, 1), cw = CA / n, bw = Math.max(2, cw * 0.66);
  const ms = IVS[iv], t0 = candles[0]?.t ?? Date.now();
  const idxOf = (t: number) => Math.max(0, Math.min(n - 1, Math.floor((t - t0) / ms)));
  const xOf = (t: number) => idxOf(t) * cw + cw / 2;
  const entryIdx = [idxOf(ts(a.openedAt)), idxOf(ts(b.openedAt))];
  const start = Math.max(ts(a.openedAt), ts(b.openedAt));

  // Who wins where: the long side wins above its entry, the short side below its entry.
  const L = a.side === "long" ? a : b.side === "long" ? b : null, S = a.side === "short" ? a : b.side === "short" ? b : null;
  const zones = L && S && L !== S ? { upper: Math.max(L.entry, S.entry), lower: Math.min(L.entry, S.entry), bothWin: S.entry > L.entry, L, S } : null;

  return (
    <div className="ar-chart">
      {candles.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {/* the future: open space after the last candle, coloured by who wins if price goes there */}
          {zones ? (
            <>
              <rect x={CA} y="0" width={W - CA} height={y(zones.upper)} fill="var(--green)" opacity=".13" />
              <rect x={CA} y={y(zones.upper)} width={W - CA} height={Math.max(0, y(zones.lower) - y(zones.upper))} fill={zones.bothWin ? "var(--gold)" : "var(--text)"} opacity={zones.bothWin ? 0.1 : 0.05} />
              <rect x={CA} y={y(zones.lower)} width={W - CA} height={Math.max(0, H - y(zones.lower))} fill="var(--red)" opacity=".13" />
            </>
          ) : <rect x={CA} y="0" width={W - CA} height={H} fill="var(--text)" opacity=".03" />}
          <line x1={CA} x2={CA} y1="0" y2={H} stroke="var(--text)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".35" />
          {candles.map((c, i) => {
            const up = c.c >= c.o, x = i * cw + cw / 2, col = up ? GREEN : RED;
            const isEntry = entryIdx.includes(i);
            return (
              <g key={c.t} opacity={c.t + ms < start && !isEntry ? 0.4 : 1}>
                {isEntry && <rect x={x - cw / 2} y="0" width={cw} height={H} fill={entryIdx[0] === i ? sideCol(a) : sideCol(b)} opacity=".16" />}
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.4, Math.abs(y(c.o) - y(c.c)))} fill={col} />
              </g>
            );
          })}
          {inLv.map((l) => (
            <line key={l.key} x1="0" x2={W} y1={y(l.p)} y2={y(l.p)} stroke={l.kind === "LIQ" ? "var(--text)" : sideCol(l.f)} strokeDasharray={l.kind === "TP" ? "5 3" : l.kind === "SL" ? "1.5 2.5" : "1 3"} strokeWidth={l.kind === "LIQ" ? 1.6 : 1.2} vectorEffect="non-scaling-stroke" opacity=".75" />
          ))}
          {[a, b].map((f, i) => (
            <line key={i} x1={xOf(ts(f.openedAt))} x2={W} y1={y(f.entry)} y2={y(f.entry)} stroke={sideCol(f)} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={y(px)} y2={y(px)} stroke="var(--text)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".6" />
        </svg>
      ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 16 }} />}

      {candles.length > 0 && (
        <div className="ar-ov">
          {zones && <span className="ar-zone up" style={{ left: pctX(CA + 6) }}><Avatar handle={zones.L.handle} url={zones.L.avatarUrl} size={14} link={false} />{zones.L.handle} wins ↑</span>}
          {zones && <span className="ar-zone down" style={{ left: pctX(CA + 6) }}><Avatar handle={zones.S.handle} url={zones.S.avatarUrl} size={14} link={false} />{zones.S.handle} wins ↓</span>}
          {zones && y(zones.lower) - y(zones.upper) > 26 && <span className="ar-zone mid" style={{ left: pctX(CA + 6), top: pctY((zones.upper + zones.lower) / 2) }}>{zones.bothWin ? "both in profit" : "both losing"}</span>}
          {inLv.map((l) => (
            <span key={l.key} className={`ar-lv ${l.kind === "LIQ" ? "liq" : l.f.side}`} style={{ top: pctY(l.p) }}>
              <Avatar handle={l.f.handle} url={l.f.avatarUrl} size={12} link={false} />{l.kind}
            </span>
          ))}
          {[a, b].map((f, i) => (
            <span key={`pin${i}`} className={`ar-pin ${f.side}`} style={{ left: pctX(xOf(ts(f.openedAt))), top: pctY(f.entry) }} title={`${f.handle} ${f.side === "long" ? "bought" : "sold"} at ${fmtPrice(f.entry)}`}>
              <Avatar handle={f.handle} url={f.avatarUrl} size={20} link={false} />
              <em>{f.side === "long" ? "▲" : "▼"}</em>
            </span>
          ))}
          <i className="ar-dot" style={{ left: pctX(CA), top: pctY(px) }} />
          <span className="ar-axis now" style={{ top: pctY(px) }}>{fmtPrice(px)}</span>
          <span className="ar-nowlbl" style={{ left: pctX(CA) }}>now</span>
        </div>
      )}
      {offLv.filter((l) => l.p > top).length > 0 && <span className="ar-edges up">{offLv.filter((l) => l.p > top).map((l) => <b key={l.key} className={l.kind === "LIQ" ? "liq" : l.f.side}><Avatar handle={l.f.handle} url={l.f.avatarUrl} size={12} link={false} />{l.kind} ↑</b>)}</span>}
      {offLv.filter((l) => l.p < bot).length > 0 && <span className="ar-edges down">{offLv.filter((l) => l.p < bot).map((l) => <b key={l.key} className={l.kind === "LIQ" ? "liq" : l.f.side}><Avatar handle={l.f.handle} url={l.f.avatarUrl} size={12} link={false} />{l.kind} ↓</b>)}</span>}
      <span className="tc-ivs ar-ivs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {(Object.keys(IVS) as Iv[]).map((v) => <button key={v} type="button" className={v === iv ? "on" : ""} onClick={(e) => pick(e, v)}>{v}</button>)}
      </span>
    </div>
  );
}

function RaceChart({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const candles = useCandles(coin, "5m", 60);
  const [go, setGo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t); }, []);
  const start = Math.max(ts(a.openedAt), ts(b.openedAt));
  const roiAt = (f: Fighter, p: number) => (f.side === "long" ? (p - f.entry) / f.entry : (f.entry - p) / f.entry) * 100 * f.lev;
  const pts = candles.filter((c) => c.t + IVS["5m"] >= start).map((c) => c.c);
  if (live) pts.push(live);
  const series = pts.map((p) => [roiAt(a, p), roiAt(b, p)] as const);
  let changes = 0, aLead = 0;
  series.forEach((s, i) => { if (s[0] >= s[1]) aLead++; if (i > 0 && Math.sign(s[0] - s[1]) !== Math.sign(series[i - 1][0] - series[i - 1][1]) && s[0] !== s[1]) changes++; });
  const aShare = series.length ? Math.round((aLead / series.length) * 100) : 50;
  // momentum: ROI change over the last ~6 candles
  const mom = (k: 0 | 1) => (series.length > 6 ? series[series.length - 1][k] - series[series.length - 7][k] : 0);
  // Zoom the track on the gap, not on zero: a 1% lead must look like real distance.
  const avg = (a.roi + b.roi) / 2, gapAbs = Math.abs(a.roi - b.roi);
  const scale = Math.max(gapAbs * 0.85, 1.2); // half-width of the track, in ROI points
  const pos = (r: number) => Math.max(5, Math.min(95, 50 + ((r - avg) / scale) * 42));
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
  const step = steps.find((v) => scale / v <= 4) ?? 100;
  const ticks: number[] = [];
  for (let v = Math.ceil((avg - scale * 1.2) / step) * step; v <= avg + scale * 1.2; v += step) ticks.push(Number(v.toFixed(4)));
  const leader = a.roi === b.roi ? null : a.roi > b.roi ? a : b;
  const gap = Math.abs(a.roi - b.roi);
  const Lane = ({ f, m }: { f: Fighter; m: number }) => {
    const p = go ? pos(f.roi) : pos(avg), up = f.roi >= 0;
    return (
      <div className={`rc-lane ${leader === f ? "lead" : ""}`}>
        <div className="rc-name"><Avatar handle={f.handle} url={f.avatarUrl} size={18} link={false} /><b>{f.handle}</b><span className={`lbl ${f.side}`}><i />{f.side === "long" ? "Long" : "Short"} {f.lev}×</span>{leader === f && <span className="rc-crown">Leading</span>}</div>
        <div className="rc-track">
          {ticks.map((v) => <span key={v} className={`rc-tick ${v === 0 ? "zero" : ""}`} style={{ left: `${pos(v)}%` }} />)}
          <span className="rc-trail" style={{ left: `${Math.min(pos(Math.min(a.roi, b.roi)), p)}%`, width: `${Math.abs(p - pos(Math.min(a.roi, b.roi)))}%`, background: leader === f ? "var(--gold)" : "transparent" }} />
          <span className={`rc-runner ${up ? "g" : "r"}`} style={{ left: `${p}%` }}>
            <Avatar handle={f.handle} url={f.avatarUrl} size={28} link={false} />
            <b className={`mono ${up ? "green" : "red"}`}>{fmtPct(f.roi, 1)}</b>
          </span>
        </div>
        <div className={`rc-mom ${m >= 0 ? "green" : "red"}`}>{Math.abs(m) < 0.05 ? "holding steady" : m > 0 ? `▲ gaining ${m.toFixed(1)}% in the last 30m` : `▼ fading ${Math.abs(m).toFixed(1)}% in the last 30m`}</div>
      </div>
    );
  };
  return (
    <div className="rc">
      <div className="rc-gap">{leader ? <><b>{leader.handle}</b> ahead by <b className="mono">{gap.toFixed(1)}%</b></> : "Dead level"}</div>
      {Lane({ f: a, m: mom(0) })}
      {leader && (
        <div className="rc-gapbar">
          <span className="rc-bracket" style={{ left: `${pos(Math.min(a.roi, b.roi))}%`, width: `${pos(Math.max(a.roi, b.roi)) - pos(Math.min(a.roi, b.roi))}%` }}><b className="mono">{gapAbs.toFixed(gapAbs < 10 ? 2 : 1)}% gap</b></span>
        </div>
      )}
      {Lane({ f: b, m: mom(1) })}
      <div className="rc-scale"><span className="muted">each tick = {step}% ROI</span>{ticks.includes(0) && <span className="muted">| = start (0%)</span>}</div>
      <div className="ar-lead">
        <div className="ar-leadhead"><span>Time in the lead</span><span>{changes} lead change{changes === 1 ? "" : "s"}</span></div>
        <div className="ar-leadbar"><i className={a.side} style={{ width: `${aShare}%` }} /><i className={b.side} style={{ width: `${100 - aShare}%` }} /></div>
        <div className="ar-leadfoot"><b style={{ color: sideCol(a) }}>{a.handle} {aShare}%</b><b style={{ color: sideCol(b) }}>{b.handle} {100 - aShare}%</b></div>
      </div>
    </div>
  );
}

function Tape({ a, b }: { a: Fighter; b: Fighter }) {
  const la = liqOf(a), lb = liqOf(b);
  const rows: [string, string, string][] = [
    ["Entry", `${a.side === "long" ? "▲" : "▼"} ${fmtPrice(a.entry)}`, `${b.side === "long" ? "▲" : "▼"} ${fmtPrice(b.entry)}`],
    ["Size", a.margin ? `${fmtUsd(a.margin)} × ${a.lev}` : `${a.lev}×`, b.margin ? `${fmtUsd(b.margin)} × ${b.lev}` : `${b.lev}×`],
    ["Take profit", a.tp ? fmtPrice(a.tp) : "—", b.tp ? fmtPrice(b.tp) : "—"],
    ["Stop loss", a.sl ? fmtPrice(a.sl) : "—", b.sl ? fmtPrice(b.sl) : "—"],
    ["Liquidation", la ? fmtPrice(la) : "—", lb ? fmtPrice(lb) : "—"],
    ["ROI", fmtPct(a.roi, 1), fmtPct(b.roi, 1)],
  ];
  return (
    <div className="ar-tape">
      <div className="ar-taperow head"><b style={{ color: sideCol(a) }}>{a.handle}</b><span>Tale of the tape</span><b style={{ color: sideCol(b) }}>{b.handle}</b></div>
      {rows.map(([k, x, z]) => <div key={k} className="ar-taperow"><b className="mono">{x}</b><span>{k}</span><b className="mono">{z}</b></div>)}
    </div>
  );
}

/* ======================================================================
   Card chart: the fade card in the feed. Same battle, simpler picture:
   each trader's avatar marks their entry, the leader's gap to the live price is shaded, no lines.
   ====================================================================== */
export function BattleCardChart({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const box = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { data } = useSWR<{ candles: Candle[] }>(vis ? `/api/markets/${coin}/candles?interval=5m&limit=50` : null, { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false });
  const candles = (data?.candles ?? []).slice(-36);
  const px = live || candles[candles.length - 1]?.c || a.entry;
  const W = 300, H = 130, PAD = 8;
  const hi = Math.max(px, a.entry, b.entry, ...candles.map((c) => c.h));
  const lo = Math.min(px, a.entry, b.entry, ...candles.map((c) => c.l));
  const span = Math.max(hi - lo, px * 0.002), top = hi + span * 0.12, bot = lo - span * 0.12;
  const y = (p: number) => PAD + (1 - (p - bot) / (top - bot)) * (H - PAD * 2);
  const pctY = (p: number) => `${(y(p) / H) * 100}%`;
  const pctX = (x: number) => `${(x / W) * 100}%`;
  // Layout: grey history before the first entry takes at most 30%, the fight fills the middle in colour,
  // and the last 26% is open space ahead of "now", split into who wins where.
  const n = Math.max(candles.length, 1), t0 = candles[0]?.t ?? Date.now(), ms = IVS["5m"];
  const idx = (t: number) => Math.max(0, Math.min(n - 1, Math.floor((t - t0) / ms)));
  const first = Math.min(idx(ts(a.openedAt)), idx(ts(b.openedAt)));
  const FUT = W * 0.26, room = W - FUT;
  const histW = first ? Math.min(W * 0.3, (room * first) / n) : 0, liveW = room - histW, liveN = Math.max(1, n - first);
  const xOf = (i: number) => (i < first ? (i + 0.5) * (histW / first) : histW + (i - first + 0.5) * (liveW / liveN));
  const bwOf = (i: number) => Math.max(1.6, (i < first ? histW / first : liveW / liveN) * 0.62);
  const nowX = histW + liveW;
  // Who wins where: the long side wins above its entry, the short side below its entry.
  const L = a.side === "long" ? a : b.side === "long" ? b : null, S = a.side === "short" ? a : b.side === "short" ? b : null;
  const zones = L && S && L !== S ? { up: L, upP: Math.max(L.entry, S.entry), down: S, downP: Math.min(L.entry, S.entry) } : null;
  const leader = Math.abs(a.roi - b.roi) < 0.05 ? null : a.roi > b.roi ? a : b;
  return (
    <div ref={box} className="bcc">
      {candles.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {zones && (
            <>
              <rect x={histW} y="0" width={W - histW} height={y(zones.upP)} fill={GREEN} opacity=".1" />
              <rect x={histW} y={y(zones.downP)} width={W - histW} height={Math.max(0, H - y(zones.downP))} fill={RED} opacity=".1" />
            </>
          )}
          <line x1={nowX} x2={nowX} y1="0" y2={H} stroke="var(--text)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".18" />
          {candles.map((c, i) => {
            const x = xOf(i), bw = bwOf(i), before = i < first;
            const col = before ? "var(--muted)" : c.c >= c.o ? GREEN : RED;
            return (
              <g key={c.t} opacity={before ? 0.4 : 1}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.4, Math.abs(y(c.o) - y(c.c)))} fill={col} rx="0.6" />
              </g>
            );
          })}
        </svg>
      ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 12 }} />}
      {candles.length > 0 && (
        <>
          {zones && <span className="bcc-zone up" style={{ left: pctX(nowX + 6) }}>{zones.up.handle} wins</span>}
          {zones && <span className="bcc-zone down" style={{ left: pctX(nowX + 6) }}>{zones.down.handle} wins</span>}
          {[a, b].map((f, i) => (
            <span key={i} className={`bcc-pin ${f.side}`} style={{ left: pctX(xOf(idx(ts(f.openedAt)))), top: pctY(f.entry) }} title={`${f.handle} ${f.side === "long" ? "bought" : "sold"} at ${fmtPrice(f.entry)}`}>
              <Avatar handle={f.handle} url={f.avatarUrl} size={20} link={false} />
            </span>
          ))}
          <i className="bcc-dot" style={{ left: pctX(nowX), top: pctY(px) }} />
          <span className="bcc-lead">{leader ? `${leader.handle} leads by ${Math.abs(a.roi - b.roi).toFixed(1)}%` : "Dead level"}</span>
        </>
      )}
    </div>
  );
}

/** Small health bar for a fighter on a card: same rule as the battle page (100% at entry, 0% at stop loss or liquidation). */
export function MiniHp({ f, live, right, big }: { f: Fighter; live: number; right?: boolean; big?: boolean }) {
  const h = healthOf(f, live), low = h < 0.35;
  return (
    <span className={`mhp ${big ? "big" : ""} ${right ? "r" : ""} ${low ? "low" : ""}`} title={`${Math.round(h * 100)}% health`}>
      <i className={f.side} style={{ width: `${Math.max(4, h * 100)}%` }} />
    </span>
  );
}

"use client";

import useSWR from "swr";
import { useEffect, useState, type MouseEvent } from "react";
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
/** Margin health: 100% at entry or better, 0% at liquidation. */
export function healthOf(f: Fighter, live: number) {
  const liq = liqOf(f); if (!liq) return 1;
  const h = f.side === "long" ? (live - liq) / (f.entry - liq) : (liq - live) / (liq - f.entry);
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
  const h = healthOf(f, live), liq = liqOf(f);
  const liqDist = liq ? Math.abs((live - liq) / live) * 100 : null;
  const slDist = f.sl ? Math.abs((live - f.sl) / live) * 100 : null;
  const danger = h < 0.35 || (slDist !== null && slDist < 0.5);
  return (
    <div className={`ar-hpbox ${right ? "r" : ""}`}>
      <div className="ar-hphead"><span>Margin HP</span><b style={{ color: danger ? "var(--gold)" : sideCol(f) }}>{Math.round(h * 100)}%</b></div>
      <div className="ar-hpbar"><i className={f.side} style={{ width: `${Math.max(3, h * 100)}%` }} /></div>
      <div className="ar-hpfoot">{liqDist !== null ? `Liq ${liqDist.toFixed(1)}% away` : "No liquidation at 1×"}{slDist !== null ? ` · SL ${slDist.toFixed(1)}%` : ""}</div>
    </div>
  );
}

function ArenaChart({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const [iv, pick] = useIv();
  const candles = useCandles(coin, iv, 48);
  const px = live || candles[candles.length - 1]?.c || a.entry;
  const W = 300, H = 220, PAD = 8, RIGHT = 6;
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
  const pad = fSpan * 0.07;
  const top = Math.max(...all) + pad, bot = Math.min(...all) - pad;
  const rng = Math.max(top - bot, px * 0.002);
  const y = (p: number) => PAD + (1 - (p - bot) / rng) * (H - PAD * 2);
  const pctY = (p: number) => `${(y(p) / H) * 100}%`;
  const n = Math.max(candles.length, 1), cw = (W - RIGHT) / n, bw = Math.max(1.5, cw * 0.66);
  const ms = IVS[iv], t0 = candles[0]?.t ?? Date.now();
  const xOf = (t: number) => Math.max(0, Math.min(n - 1, Math.floor((t - t0) / ms))) * cw + cw / 2;
  const pctX = (x: number) => `${(x / W) * 100}%`;

  // Territory: the long side profits above its entry, the short side below its entry.
  const L = a.side === "long" ? a : b.side === "long" ? b : null, S = a.side === "short" ? a : b.side === "short" ? b : null;
  const turf = L && S && L !== S ? { upper: Math.max(L.entry, S.entry), lower: Math.min(L.entry, S.entry), bothWin: S.entry > L.entry, L, S } : null;
  const start = Math.max(ts(a.openedAt), ts(b.openedAt));

  return (
    <div className="ar-chart">
      {candles.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {turf && (
            <>
              <rect x="0" y="0" width={W} height={y(turf.upper)} fill="var(--green)" opacity=".1" />
              <rect x="0" y={y(turf.upper)} width={W} height={Math.max(0, y(turf.lower) - y(turf.upper))} fill={turf.bothWin ? "var(--gold)" : "var(--text)"} opacity={turf.bothWin ? 0.08 : 0.04} />
              <rect x="0" y={y(turf.lower)} width={W} height={Math.max(0, H - y(turf.lower))} fill="var(--red)" opacity=".1" />
            </>
          )}
          {candles.map((c, i) => {
            const up = c.c >= c.o, x = i * cw + cw / 2, col = up ? GREEN : RED;
            return (
              <g key={c.t} opacity={c.t + ms < start ? 0.5 : 1}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))} fill={col} />
              </g>
            );
          })}
          {inLv.map((l) => (
            <line key={l.key} x1="0" x2={W} y1={y(l.p)} y2={y(l.p)} stroke={l.kind === "LIQ" ? "var(--text)" : sideCol(l.f)} strokeDasharray={l.kind === "TP" ? "5 3" : l.kind === "SL" ? "1.5 2.5" : "1 3"} strokeWidth={l.kind === "LIQ" ? 1.6 : 1.3} vectorEffect="non-scaling-stroke" opacity=".9" />
          ))}
          {[a, b].map((f, i) => {
            const x = xOf(ts(f.openedAt));
            return (
              <g key={i}>
                <line x1={x} x2={x} y1="0" y2={H} stroke={sideCol(f)} strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".5" />
                <line x1={x} x2={W} y1={y(f.entry)} y2={y(f.entry)} stroke={sideCol(f)} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          <line x1="0" x2={W} y1={y(px)} y2={y(px)} stroke="var(--text)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".7" />
        </svg>
      ) : <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 16 }} />}

      {candles.length > 0 && turf && <span className="ar-turf top" style={{ color: "var(--green)" }}>{turf.L.handle}&apos;s turf</span>}
      {candles.length > 0 && turf && <span className="ar-turf bot" style={{ color: "var(--red)" }}>{turf.S.handle}&apos;s turf</span>}
      {candles.length > 0 && (
        <div className="ar-ov">
          {inLv.map((l) => (
            <span key={l.key} className={`ar-lv ${l.kind === "LIQ" ? "liq" : l.f.side}`} style={{ top: pctY(l.p), left: l.f === a ? "6px" : "auto", right: l.f === a ? "auto" : "4px" }}>
              <Avatar handle={l.f.handle} url={l.f.avatarUrl} size={13} link={false} />{l.kind} {fmtPrice(l.p)}
            </span>
          ))}
          {[a, b].map((f, i) => (
            <span key={i} className={`ar-act ${f.side}`} style={{ left: pctX(xOf(ts(f.openedAt))), top: pctY(f.entry) }}>
              <Avatar handle={f.handle} url={f.avatarUrl} size={16} link={false} />{f.side === "long" ? "▲ BUY" : "▼ SELL"}
            </span>
          ))}
          <span className="ar-axis now" style={{ top: pctY(px) }}>{fmtPrice(px)}</span>
          {[a, b].map((f, i) => <span key={i} className={`ar-axis ${f.side}`} style={{ top: pctY(f.entry) }}>{fmtPrice(f.entry)}</span>)}
          <i className="ar-dot" style={{ top: pctY(px) }} />
        </div>
      )}
      {offLv.filter((l) => l.p > top).length > 0 && <span className="ar-edges up">{offLv.filter((l) => l.p > top).map((l) => <b key={l.key} className={l.kind === "LIQ" ? "liq" : l.f.side}>{l.kind} {l.f.handle} ↑ {fmtPrice(l.p)}</b>)}</span>}
      {offLv.filter((l) => l.p < bot).length > 0 && <span className="ar-edges down">{offLv.filter((l) => l.p < bot).map((l) => <b key={l.key} className={l.kind === "LIQ" ? "liq" : l.f.side}>{l.kind} {l.f.handle} ↓ {fmtPrice(l.p)}</b>)}</span>}
      <span className="tc-ivs ar-ivs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {(Object.keys(IVS) as Iv[]).map((v) => <button key={v} type="button" className={v === iv ? "on" : ""} onClick={(e) => pick(e, v)}>{v}</button>)}
      </span>
      <div className="ar-legend"><span><i className="solid" />Entry</span><span><i className="dash" />TP</span><span><i className="dot" />SL</span><span><i className="liqd" />Liq</span></div>
    </div>
  );
}

function RaceChart({ coin, live, a, b }: { coin: string; live: number; a: Fighter; b: Fighter }) {
  const [iv, pick] = useIv();
  const candles = useCandles(coin, iv, 120);
  const start = Math.max(ts(a.openedAt), ts(b.openedAt));
  const roiAt = (f: Fighter, p: number) => (f.side === "long" ? (p - f.entry) / f.entry : (f.entry - p) / f.entry) * 100 * f.lev;
  const pts = candles.filter((c) => c.t + IVS[iv] >= start).map((c) => c.c);
  if (live) pts.push(live);
  const series = pts.map((p) => [roiAt(a, p), roiAt(b, p)] as const);
  const W = 300, H = 200, PAD = 12;
  const vals = series.flatMap((s) => [s[0], s[1]]).concat(0);
  const vTop = Math.max(...vals), vBot = Math.min(...vals), span = Math.max(vTop - vBot, 2);
  const y = (v: number) => PAD + (1 - (v - (vBot - span * 0.08)) / (span * 1.16)) * (H - PAD * 2);
  const x = (i: number) => (series.length > 1 ? (i / (series.length - 1)) * (W - 16) : 0);
  const line = (k: 0 | 1) => series.map((s, i) => `${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  let changes = 0, aLead = 0;
  series.forEach((s, i) => { if (s[0] >= s[1]) aLead++; if (i > 0 && Math.sign(s[0] - s[1]) !== Math.sign(series[i - 1][0] - series[i - 1][1]) && s[0] !== s[1]) changes++; });
  const aShare = series.length ? Math.round((aLead / series.length) * 100) : 50;
  const last = series[series.length - 1];

  return (
    <div className="ar-race">
      <div className="ar-chart race">
        {series.length > 1 ? (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--text)" strokeWidth="1" opacity=".3" vectorEffect="non-scaling-stroke" />
              <polyline points={line(1)} fill="none" stroke={sideCol(b)} strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <polyline points={line(0)} fill="none" stroke={sideCol(a)} strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="ar-ov race">
            <span className="ar-head" style={{ left: `${(x(series.length - 1) / W) * 100}%`, top: `${(y(last[0]) / H) * 100}%`, boxShadow: `0 0 0 2px ${sideCol(a)}` }}><Avatar handle={a.handle} url={a.avatarUrl} size={22} link={false} /></span>
            <span className="ar-head" style={{ left: `${(x(series.length - 1) / W) * 100}%`, top: `${(y(last[1]) / H) * 100}%`, boxShadow: `0 0 0 2px ${sideCol(b)}` }}><Avatar handle={b.handle} url={b.avatarUrl} size={22} link={false} /></span>
            <span className="ar-zero" style={{ top: `${(y(0) / H) * 100}%` }}>0%</span>
            </div>
          </>
        ) : <div className="ar-empty">The race starts with the next candle.</div>}
        <span className="tc-ivs ar-ivs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {(Object.keys(IVS) as Iv[]).map((v) => <button key={v} type="button" className={v === iv ? "on" : ""} onClick={(e) => pick(e, v)}>{v}</button>)}
        </span>
        <span className="ar-turf top" style={{ color: "var(--muted)" }}>ROI since the fade</span>
      </div>
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

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
  const idxOf = (t: number) => Math.max(0, Math.min(n - 1, Math.floor((t - t0) / ms)));
  const xOf = (t: number) => idxOf(t) * cw + cw / 2;
  const entryIdx = [idxOf(ts(a.openedAt)), idxOf(ts(b.openedAt))];

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
              <g key={c.t} opacity={c.t + ms < start && !entryIdx.includes(i) ? 0.5 : 1}>
                {entryIdx.includes(i) && <rect x={x - cw / 2} y="0" width={cw} height={H} fill={entryIdx[0] === i ? sideCol(a) : sideCol(b)} opacity=".14" />}
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

      {candles.length > 0 && (
        <div className="ar-ov">
          {inLv.map((l) => (
            <span key={l.key} className={`ar-lv ${l.kind === "LIQ" ? "liq" : l.f.side}`} style={{ top: pctY(l.p) }}>
              <Avatar handle={l.f.handle} url={l.f.avatarUrl} size={13} link={false} />{l.kind} {fmtPrice(l.p)}
            </span>
          ))}
          {[a, b].map((f, i) => (
            <span key={i} className={`ar-act ${f.side}`} style={{ left: i === 1 && Math.abs(y(a.entry) - y(b.entry)) < 16 ? "78px" : "4px", top: pctY(f.entry) }}>
              <Avatar handle={f.handle} url={f.avatarUrl} size={16} link={false} />{f.side === "long" ? "▲ BUY" : "▼ SELL"}
            </span>
          ))}
          <span className="ar-axis now" style={{ top: pctY(px) }}>{fmtPrice(px)}</span>
          <i className="ar-dot" style={{ top: pctY(px) }} />
          {[a, b].map((f, i) => (
            <span key={`pin${i}`} className={`ar-pin ${f.side}`} style={{ left: `${(xOf(ts(f.openedAt)) / W) * 100}%`, top: pctY(f.entry) }} title={`${f.handle} ${f.side === "long" ? "bought" : "sold"} at ${fmtPrice(f.entry)}`}>
              <Avatar handle={f.handle} url={f.avatarUrl} size={18} link={false} />
              <em>{f.side === "long" ? "▲" : "▼"}</em>
            </span>
          ))}
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
  const scale = Math.max(10, Math.ceil(Math.max(Math.abs(a.roi), Math.abs(b.roi)) * 1.25 / 10) * 10);
  const pos = (r: number) => Math.max(4, Math.min(96, 50 + (r / scale) * 46));
  const leader = a.roi === b.roi ? null : a.roi > b.roi ? a : b;
  const gap = Math.abs(a.roi - b.roi);
  const Lane = ({ f, m }: { f: Fighter; m: number }) => {
    const p = go ? pos(f.roi) : 50, up = f.roi >= 0;
    return (
      <div className={`rc-lane ${leader === f ? "lead" : ""}`}>
        <div className="rc-name"><Avatar handle={f.handle} url={f.avatarUrl} size={18} link={false} /><b>{f.handle}</b><span className={`lbl ${f.side}`}><i />{f.side === "long" ? "Long" : "Short"} {f.lev}×</span>{leader === f && <span className="rc-crown">Leading</span>}</div>
        <div className="rc-track">
          <span className="rc-mid" />
          <span className="rc-trail" style={{ left: `${Math.min(50, p)}%`, width: `${Math.abs(p - 50)}%`, background: up ? "var(--green)" : "var(--red)" }} />
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
      <Lane f={a} m={mom(0)} />
      <Lane f={b} m={mom(1)} />
      <div className="rc-scale"><span className="mono red">−{scale}%</span><span className="muted">start</span><span className="mono green">+{scale}%</span></div>
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

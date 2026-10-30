"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import type { Stats } from "@/lib/schema";
import { fmtPct, fmtUsd } from "@/lib/format";
import { CoinMark, ticker } from "./ui";

/* ---------- data shaping ---------- */

type Closed = { t: number; pnl: number; coin: string; side: "long" | "short"; roi: number; notional: number };

function useClosed(handle: string) {
  const { data } = useSWR<{ posts: FeedRow[] }>(`/api/posts?handle=${handle}&kind=trade&status=closed&limit=50`);
  return useMemo<Closed[]>(() => {
    return (data?.posts ?? [])
      .map((r) => {
        const p = r.post; const entry = Number(p.entryPx), exit = Number(p.exitPx ?? entry);
        const roi = entry ? ((exit - entry) / entry) * 100 * (p.side === "long" ? 1 : -1) * (p.leverage ?? 1) : 0;
        return { t: new Date(p.closedAt ?? p.createdAt).getTime(), pnl: Number(p.realizedPnl ?? 0), coin: p.coin!, side: p.side!, roi, notional: Number(p.notionalUsd ?? 0) };
      })
      .sort((a, b) => a.t - b.t);
  }, [data]);
}

function equity(closed: Closed[]) {
  let acc = 0; return closed.map((c) => { acc += c.pnl; return { t: c.t, v: acc }; });
}

/* ---------- SVG bits ---------- */

/** Area line with a zero baseline; green when the series ends above where it started. */
function Curve({ pts, h = 110, w = 340, showAxis = true }: { pts: { t: number; v: number }[]; h?: number; w?: number; showAxis?: boolean }) {
  if (pts.length < 2) return <div className="grid place-items-center text-xs" style={{ height: h, color: "var(--muted)" }}>Not enough closed trades yet</div>;
  const vs = pts.map((p) => p.v); const min = Math.min(0, ...vs), max = Math.max(0, ...vs), span = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * w, y = (v: number) => 8 + ((max - v) / span) * (h - 16);
  const path = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const up = vs[vs.length - 1] >= 0; const col = up ? "var(--green)" : "var(--red)";
  const zero = y(0);
  const id = `eq${Math.round(Math.random() * 1e6)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} role="img" aria-label="Cumulative P&L">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".28" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      {showAxis && <line x1="0" x2={w} y1={zero} y2={zero} stroke="var(--line)" strokeDasharray="3 4" />}
      <polygon points={`0,${zero} ${path} ${w},${zero}`} fill={`url(#${id})`} />
      <polyline points={path} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(vs[vs.length - 1])} r="3.5" fill={col} />
    </svg>
  );
}

/** Thin two-tone bar: left share in green, right in red. */
function Split({ a, b, la, lb }: { a: number; b: number; la: string; lb: string }) {
  const t = a + b || 1; const pa = Math.round((a / t) * 100);
  return (
    <div>
      <div className="flex justify-between text-[12px]"><span><b>{a}</b> <span className="muted">{la}</span></span><span><span className="muted">{lb}</span> <b>{b}</b></span></div>
      <div className="split mt-1.5"><i style={{ width: `${pa}%` }} /></div>
    </div>
  );
}

/** Ring gauge, 0–100. */
function Ring({ pct, label, sub, color }: { pct: number | null; label: string; sub?: string; color?: string }) {
  const r = 26, c = 2 * Math.PI * r; const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const col = color ?? (v >= 50 ? "var(--green)" : "var(--red)");
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="h-16 w-16 flex-none"><circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="6" /><circle cx="32" cy="32" r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} /><text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)" fontFamily="ui-monospace, monospace">{pct == null ? "—" : `${Math.round(v)}%`}</text></svg>
      <div><div className="text-sm font-bold">{label}</div>{sub && <div className="when">{sub}</div>}</div>
    </div>
  );
}

/* ---------- the profile card ---------- */

/** Compact performance card for a profile: equity curve, headline, four key figures, link to the full stats page. */
export function PerformanceCard({ handle, stats }: { handle: string; stats: Stats | null }) {
  const closed = useClosed(handle);
  const eq = equity(closed);
  const total = eq.length ? eq[eq.length - 1].v : Number(stats?.realizedPnlAll ?? 0);
  const [range, setRange] = useState<"30d" | "all">("30d");
  const since = Date.now() - 30 * 86_400_000;
  const shown = range === "30d" ? equity(closed.filter((c) => c.t >= since)) : eq;
  const shownTotal = shown.length ? shown[shown.length - 1].v : 0;
  const wins = closed.filter((c) => c.pnl > 0).length, losses = closed.filter((c) => c.pnl < 0).length;
  return (
    <section className="block">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">Performance</div>
          <div className={`mono mt-1 text-[30px] font-bold leading-none tracking-tight ${shownTotal >= 0 ? "green" : "red"}`}>{fmtUsd(shownTotal, { sign: true })}</div>
          <div className="when mt-1">{range === "30d" ? "realised, last 30 days" : "realised, all time"} · {closed.length} closed</div>
        </div>
        <div className="seg">{(["30d", "all"] as const).map((r) => <button key={r} className={`chip ${range === r ? "on" : ""}`} style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setRange(r)}>{r}</button>)}</div>
      </div>
      <div className="mt-3"><Curve pts={shown} /></div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ["Win rate", `${Math.round(Number(stats?.winRate ?? 0))}%`],
          ["All time", fmtUsd(total, { sign: true, compact: true })],
          ["Volume 30d", fmtUsd(Number(stats?.volume30d ?? 0), { compact: true })],
          ["Calls hit", stats?.callsResolved ? `${Math.round((stats.callsHit / stats.callsResolved) * 100)}%` : "—"],
        ].map(([k, v]) => <div key={k}><div className="mono text-[15px] font-bold">{v}</div><div className="when text-[11px]">{k}</div></div>)}
      </div>
      <div className="mt-3"><Split a={wins} b={losses} la="wins" lb="losses" /></div>
      <Link href={`/u/${handle}/stats`} className="chip mt-3.5 inline-flex">Full stats →</Link>
    </section>
  );
}

/* ---------- the full page body ---------- */

export function StatsPanels({ handle, stats, rivalries }: { handle: string; stats: Stats | null; rivalries: { opponent: string; wins: number; losses: number }[] }) {
  const closed = useClosed(handle);
  const eq = equity(closed);
  const byCoin = useMemo(() => {
    const m = new Map<string, { pnl: number; n: number }>();
    for (const c of closed) { const e = m.get(c.coin) ?? { pnl: 0, n: 0 }; e.pnl += c.pnl; e.n++; m.set(c.coin, e); }
    return [...m.entries()].sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl)).slice(0, 8);
  }, [closed]);
  const maxAbs = Math.max(1, ...byCoin.map(([, v]) => Math.abs(v.pnl)));
  const longs = closed.filter((c) => c.side === "long"), shorts = closed.filter((c) => c.side === "short");
  const pnlL = longs.reduce((a, c) => a + c.pnl, 0), pnlS = shorts.reduce((a, c) => a + c.pnl, 0);
  const best = closed.reduce<Closed | null>((b, c) => (!b || c.roi > b.roi ? c : b), null), worst = closed.reduce<Closed | null>((b, c) => (!b || c.roi < b.roi ? c : b), null);
  const avgWin = closed.filter((c) => c.pnl > 0).reduce((a, c, _, arr) => a + c.pnl / arr.length, 0), avgLoss = closed.filter((c) => c.pnl < 0).reduce((a, c, _, arr) => a + c.pnl / arr.length, 0);
  const wins = closed.filter((c) => c.pnl > 0).length, losses = closed.filter((c) => c.pnl < 0).length;
  const hist = useMemo(() => { const bins = [-100, -50, -20, -5, 0, 5, 20, 50, 100]; const counts = new Array(bins.length + 1).fill(0); for (const c of closed) { let i = bins.findIndex((b) => c.roi < b); if (i < 0) i = bins.length; counts[i]++; } return { bins, counts }; }, [closed]);
  const hMax = Math.max(1, ...hist.counts);

  return (
    <>
      <section className="block">
        <div className="eyebrow">Equity curve</div>
        <div className={`mono mt-1 text-[32px] font-bold leading-none tracking-tight ${(eq[eq.length - 1]?.v ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(eq[eq.length - 1]?.v ?? 0, { sign: true })}</div>
        <div className="when mt-1">cumulative realised P&L · {closed.length} closed trades</div>
        <div className="mt-3"><Curve pts={eq} h={160} /></div>
      </section>

      <section className="block">
        <div className="eyebrow">Hit rates</div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Ring pct={stats ? Number(stats.winRate) : null} label="Trades" sub={`${wins} won · ${losses} lost`} />
          <Ring pct={stats?.callsResolved ? (stats.callsHit / stats.callsResolved) * 100 : null} label="Calls" sub={`${stats?.callsResolved ?? 0} resolved${(stats?.callStreak ?? 0) >= 2 ? ` · 🔥 ${stats!.callStreak}` : ""}`} color="var(--blue)" />
          <Ring pct={stats && Number(stats.judgement) > 0 ? Number(stats.judgement) : null} label="Judgement" sub="votes on the right side" color="var(--violet)" />
          <Ring pct={stats ? (stats.copiedCount + stats.fadedCount ? (stats.copiedCount / (stats.copiedCount + stats.fadedCount)) * 100 : null) : null} label="Trust" sub={`${stats?.copiedCount ?? 0} copied · ${stats?.fadedCount ?? 0} faded`} color="var(--brand)" />
        </div>
      </section>

      <section className="block">
        <div className="eyebrow">P&amp;L by market</div>
        <div className="mt-3 flex flex-col gap-2.5">
          {byCoin.map(([coin, v]) => (
            <div key={coin} className="flex items-center gap-2.5 text-[13px]">
              <CoinMark coin={coin} size="sm" /><b className="w-14">{ticker(coin)}</b>
              <div className="hbar flex-1"><i style={{ width: `${(Math.abs(v.pnl) / maxAbs) * 100}%`, background: v.pnl >= 0 ? "var(--green)" : "var(--red)" }} /></div>
              <span className={`mono w-20 text-right font-bold ${v.pnl >= 0 ? "green" : "red"}`}>{fmtUsd(v.pnl, { sign: true, compact: true })}</span>
              <span className="when w-8 text-right">{v.n}</span>
            </div>
          ))}
          {!byCoin.length && <p className="muted text-sm">No closed trades yet.</p>}
        </div>
      </section>

      <section className="block">
        <div className="eyebrow">Long vs short</div>
        <div className="mt-3"><Split a={longs.length} b={shorts.length} la={`longs · ${fmtUsd(pnlL, { sign: true, compact: true })}`} lb={`shorts · ${fmtUsd(pnlS, { sign: true, compact: true })}`} /></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div><div className="when">Avg win</div><div className="mono green font-bold">{fmtUsd(avgWin, { sign: true })}</div></div>
          <div><div className="when">Avg loss</div><div className="mono red font-bold">{fmtUsd(avgLoss, { sign: true })}</div></div>
          <div><div className="when">Best trade</div><div className="mono green font-bold">{best ? `${fmtPct(best.roi, 0)} ${ticker(best.coin)}` : "—"}</div></div>
          <div><div className="when">Worst trade</div><div className="mono red font-bold">{worst ? `${fmtPct(worst.roi, 0)} ${ticker(worst.coin)}` : "—"}</div></div>
        </div>
      </section>

      <section className="block">
        <div className="eyebrow">ROI distribution</div>
        <div className="mt-3 flex items-end gap-1" style={{ height: 90 }}>
          {hist.counts.map((n, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${(n / hMax) * 100}%`, minHeight: n ? 3 : 0, background: i < 4 ? "var(--red)" : i === 4 ? "var(--line)" : "var(--green)", opacity: 0.85 }} title={`${n}`} />)}
        </div>
        <div className="when mt-1.5 flex justify-between text-[10px]"><span>&lt; −100%</span><span>−20%</span><span>0</span><span>+20%</span><span>&gt; +100%</span></div>
      </section>

      {rivalries?.length > 0 && (
        <section className="block">
          <div className="eyebrow">Rivalries</div>
          <div className="mt-3 flex flex-col gap-2.5">
            {rivalries.map((r) => <div key={r.opponent} className="flex items-center gap-3 text-[13px]"><b className="w-28 truncate">vs {r.opponent}</b><div className="split flex-1"><i style={{ width: `${(r.wins / Math.max(1, r.wins + r.losses)) * 100}%` }} /></div><span className="mono font-bold">{r.wins}–{r.losses}</span></div>)}
          </div>
        </section>
      )}
    </>
  );
}

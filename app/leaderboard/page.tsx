"use client";

import { Glyph } from "@/components/Glyph";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Avatar, SkeletonList, RankChip, RankEmblem } from "@/components/ui";
import { rankFor } from "@/lib/rank";
import { fmtUsd, fmtPct } from "@/lib/format";

type Row = { handle: string; avatarUrl: string | null; pnl?: number; winRate: string; closedTrades: number; volume30d: string; liquidations: number; fadedCount: number; callsResolved: number; callsHit: number; callAvgMove: string; callStreak: number; hitRate?: number; xp?: number; seasonXp?: number; battlesWon?: number; battlesLost?: number };

const seasonLeft = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000); return d > 0 ? `${d}d ${h}h` : `${Math.max(0, h)}h`; };

export default function LeaderboardPage() {
  const [mode, setMode] = useState<"trades" | "calls" | "ranks" | "season">("trades");
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [demo, setDemo] = useState(false);
  const { data, isLoading, error } = useSWR<{ rows: Row[]; bottom?: Row[]; fellBack?: boolean; error?: string; season?: { name: string; endsAt: string } }>(`/api/leaderboard?mode=${mode}&period=${period}&demo=${demo ? 1 : 0}`);
  const rows = data?.rows ?? [];
  const podium = mode !== "calls" ? rows.slice(0, 3) : [];

  return (
    <div data-tint="gold" className="fade-in">
      <header className="lb-hero" style={{ backgroundImage: "url(/api/share-bg/arena)" }}><h1 className="h1" style={{ color: "#fff" }}>Leaders</h1><div className="text-[12px]" style={{ color: "rgba(255,255,255,.8)" }}>{mode === "trades" ? "Realised PnL from Hyperliquid fills" : mode === "calls" ? "Public predictions, scored against the chart" : "XP from fades, duels, calls and trades"}</div></header>
      <div className="px-5 pb-3 pt-4">
        <div className="modes"><button className={mode === "trades" ? "on" : ""} onClick={() => setMode("trades")}>Trades</button><button className={mode === "calls" ? "on" : ""} onClick={() => setMode("calls")}>Calls</button><button className={mode === "ranks" ? "on" : ""} onClick={() => setMode("ranks")}>Ranks</button><button className={mode === "season" ? "on" : ""} onClick={() => setMode("season")}>Season</button></div>
        {mode === "season" && data?.season && <div className="season-bar mt-3"><b className="gl"><Glyph n="trophy" tone="gold" />{data.season.name} season</b><span>{seasonLeft(data.season.endsAt)} left · XP earned this month only</span></div>}
        <div className="seg mt-3">
          {mode === "trades" && (["7d", "30d", "all"] as const).map((p) => <button key={p} className={`chip ${p === period ? "on" : ""}`} onClick={() => setPeriod(p)}>{p === "all" ? "All time" : p === "7d" ? "7 days" : "30 days"}</button>)}
          <button className={`chip ${demo ? "on" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setDemo((v) => !v)}>{demo ? "Demo accounts" : "Real accounts"}</button>
        </div>
      </div>

      {data?.fellBack && !demo && <p className="when px-5 pb-2 text-[12px]">No real-money traders ranked yet — showing demo accounts.</p>}
      {(error || data?.error) && <div className="block text-center red text-sm">Leaderboard failed to load: {String(data?.error ?? error?.message ?? error)}</div>}
      {isLoading && rows.length === 0 && <SkeletonList n={5} card={false} />}
      {!isLoading && !error && !data?.error && rows.length === 0 && <div className="block text-center muted">{mode === "trades" ? "No closed trades yet this period." : mode === "calls" ? "Nobody has 5 resolved calls yet. Make some calls." : "Nobody ranked yet."}</div>}

      {podium.length === 3 && (
        <div className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2.5 px-5 pb-4">
          {[podium[1], podium[0], podium[2]].map((r, i) => {
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <Link key={r.handle} href={`/u/${r.handle}`} className="card relative p-3.5 text-center" style={{ background: place === 1 ? "var(--gold-soft)" : undefined, paddingTop: place === 1 ? 18 : 14 }}>
                <img src={`/api/share-bg/medal-${place}`} alt="" className="medal" />
                <div className="flex justify-center"><Avatar handle={r.handle} url={r.avatarUrl} size={place === 1 ? 60 : 48} link={false} /></div>
                <div className="mt-2 text-[13px] font-bold">{r.handle}</div>
                {mode === "ranks" || mode === "season" ? (
                  <><div className="mt-1 flex justify-center"><RankEmblem level={rankFor(r.xp ?? 0).level} size={place === 1 ? 40 : 32} /></div><div className="when mt-1">{rankFor(r.xp ?? 0).title}</div><div className="mono text-[14px] font-semibold">{(mode === "season" ? r.seasonXp ?? 0 : r.xp ?? 0).toLocaleString()} XP</div></>
                ) : (
                  <><div className={`mono text-[15px] font-semibold ${(r.pnl ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl ?? 0, { sign: true, compact: true })}</div>{place === 1 && <div className="when">{fmtPct(Number(r.winRate), 0)} win</div>}</>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {rows.map((r, i) => (
        <Link key={r.handle} href={`/u/${r.handle}`} className="lb">
          <span className="rank">{i + 1}</span>
          <Avatar handle={r.handle} url={r.avatarUrl} size={44} link={false} />
          <div className="min-w-0 flex-1">
            <div className="name">{r.handle}<RankChip xp={r.xp} compact /></div>
            <div className="when truncate">{mode === "ranks" || mode === "season" ? `${rankFor(r.xp ?? 0).title} · fades ${r.battlesWon ?? 0}–${r.battlesLost ?? 0} · ${fmtPct(Number(r.winRate), 0)} win` : mode === "trades" ? `${r.closedTrades} trades · ${fmtPct(Number(r.winRate), 0)} win · ${fmtUsd(Number(r.volume30d), { compact: true })} volume` : `${r.callsResolved} calls · ${r.callsHit} hit · avg ${fmtPct(Number(r.callAvgMove), 1)}${r.callStreak > 1 ? ` · ${r.callStreak} in a row` : ""} · trades ${fmtPct(Number(r.winRate), 0)} win`}</div>
          </div>
          {mode === "ranks" || mode === "season" ? <div className="text-right"><div className="mono text-[17px] font-bold">{(mode === "season" ? r.seasonXp ?? 0 : r.xp ?? 0).toLocaleString()}</div><div className="when">{mode === "season" ? "season XP" : "XP"}</div></div> : mode === "trades" ? <div className={`mono text-[17px] font-bold ${(r.pnl ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl ?? 0, { sign: true, compact: true })}</div> : <div className="text-right"><div className="mono text-[17px] font-bold">{Math.round(r.hitRate ?? 0)}%</div><div className="when">hit rate</div></div>}
        </Link>
      ))}

      {mode === "trades" && (data?.bottom?.length ?? 0) > 0 && (
        <>
          <div className="eyebrow px-5 pb-1.5 pt-5" style={{ color: "var(--red)" }}>Exit liquidity · {period === "all" ? "all time" : period} · opted in</div>
          {data!.bottom!.map((r, i) => (
            <Link key={r.handle} href={`/u/${r.handle}`} className="lb">
              <span className="rank">↓{i + 1}</span>
              <Avatar handle={r.handle} url={r.avatarUrl} size={44} link={false} />
              <div className="min-w-0 flex-1"><div className="name">{r.handle}</div><div className="when truncate">{r.closedTrades} trades · {fmtPct(Number(r.winRate), 0)} win{r.liquidations ? ` · ${r.liquidations} liquidation${r.liquidations === 1 ? "" : "s"}` : ""}{r.fadedCount ? ` · faded ${r.fadedCount}×` : ""}</div></div>
              <div className="mono red text-[17px] font-bold">{fmtUsd(r.pnl ?? 0, { sign: true, compact: true })}</div>
            </Link>
          ))}
          <p className="muted px-5 py-3.5 text-xs leading-relaxed">Only traders who turned on "Show me at the bottom" in Settings appear here.</p>
        </>
      )}
      <p className="muted px-5 py-3.5 text-xs leading-relaxed">{mode === "trades" ? "Only trades placed through Perped count, so every number is verifiable on-chain." : "A call is a public prediction: coin, direction, target, deadline. Perped checks it against Hyperliquid prices. Minimum 5 resolved calls to rank."}</p>
    </div>
  );
}

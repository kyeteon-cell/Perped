"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { fmtUsd, fmtPct } from "@/lib/format";

type Row = { handle: string; avatarUrl: string | null; pnl?: number; winRate: string; closedTrades: number; volume30d: string; liquidations: number; fadedCount: number; callsResolved: number; callsHit: number; callAvgMove: string; callStreak: number; hitRate?: number };

export default function LeaderboardPage() {
  const [mode, setMode] = useState<"trades" | "calls">("trades");
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const { data, isLoading } = useSWR<{ rows: Row[]; bottom?: Row[] }>(`/api/leaderboard?mode=${mode}&period=${period}`);
  const rows = data?.rows ?? [];
  const podium = mode === "trades" ? rows.slice(0, 3) : [];

  return (
    <div data-tint="gold" className="fade-in">
      <header className="px-5 pt-4"><h1 className="h1 dot">Leaders</h1><div className="when">{mode === "trades" ? "Realised PnL from Hyperliquid fills" : "Public predictions, scored against the chart"}</div></header>
      <div className="px-5 pb-3 pt-4">
        <div className="modes"><button className={mode === "trades" ? "on" : ""} onClick={() => setMode("trades")}>Trades</button><button className={mode === "calls" ? "on" : ""} onClick={() => setMode("calls")}>Calls</button></div>
        {mode === "trades" && <div className="seg mt-3">{(["7d", "30d", "all"] as const).map((p) => <button key={p} className={`chip ${p === period ? "on" : ""}`} onClick={() => setPeriod(p)}>{p === "all" ? "All time" : p === "7d" ? "7 days" : "30 days"}</button>)}</div>}
      </div>

      {isLoading && <p className="muted px-5 py-4 text-sm">Loading…</p>}
      {!isLoading && rows.length === 0 && <div className="block text-center muted">{mode === "trades" ? "No closed trades yet this period." : "Nobody has 5 resolved calls yet. Make some calls."}</div>}

      {podium.length === 3 && (
        <div className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2.5 px-5 pb-4">
          {[podium[1], podium[0], podium[2]].map((r, i) => {
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <Link key={r.handle} href={`/u/${r.handle}`} className="card relative p-3.5 text-center" style={{ background: place === 1 ? "var(--gold-soft)" : undefined, paddingTop: place === 1 ? 18 : 14 }}>
                <span className="absolute -top-2.5 left-1/2 grid h-[22px] w-[22px] -translate-x-1/2 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: place === 1 ? "var(--gold)" : place === 2 ? "#9aa3b2" : "#c98a5a" }}>{place}</span>
                <div className="flex justify-center"><Avatar handle={r.handle} url={r.avatarUrl} size={place === 1 ? 60 : 48} /></div>
                <div className="mt-2 text-[13px] font-bold">{r.handle}</div>
                <div className={`mono text-[15px] font-semibold ${(r.pnl ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl ?? 0, { sign: true, compact: true })}</div>
                {place === 1 && <div className="when">{fmtPct(Number(r.winRate), 0)} win</div>}
              </Link>
            );
          })}
        </div>
      )}

      {rows.map((r, i) => (
        <Link key={r.handle} href={`/u/${r.handle}`} className="lb">
          <span className="rank">{i + 1}</span>
          <Avatar handle={r.handle} url={r.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <div className="name">{r.handle}</div>
            <div className="when truncate">{mode === "trades" ? `${r.closedTrades} trades · ${fmtPct(Number(r.winRate), 0)} win · ${fmtUsd(Number(r.volume30d), { compact: true })} volume` : `${r.callsResolved} calls · ${r.callsHit} hit · avg ${fmtPct(Number(r.callAvgMove), 1)}${r.callStreak > 1 ? ` · 🔥 ${r.callStreak}` : ""} · trades ${fmtPct(Number(r.winRate), 0)} win`}</div>
          </div>
          {mode === "trades" ? <div className={`mono text-[17px] font-bold ${(r.pnl ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl ?? 0, { sign: true, compact: true })}</div> : <div className="text-right"><div className="mono text-[17px] font-bold">{Math.round(r.hitRate ?? 0)}%</div><div className="when">hit rate</div></div>}
        </Link>
      ))}

      {mode === "trades" && (data?.bottom?.length ?? 0) > 0 && (
        <>
          <div className="eyebrow px-5 pb-1.5 pt-5" style={{ color: "var(--red)" }}>Exit liquidity · {period === "all" ? "all time" : period} · opted in</div>
          {data!.bottom!.map((r, i) => (
            <Link key={r.handle} href={`/u/${r.handle}`} className="lb">
              <span className="rank">↓{i + 1}</span>
              <Avatar handle={r.handle} url={r.avatarUrl} size={44} />
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

"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Header } from "@/components/Header";
import { fmtUsd, fmtPct } from "@/lib/format";

type Row = { handle: string; pnl: number; winRate: string; closedTrades: number; volume30d: string; updatedAt: string };

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const { data, isLoading } = useSWR<{ rows: Row[] }>(`/api/leaderboard?period=${period}`);
  const rows = data?.rows ?? [];
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <>
      <Header title="Leaderboard" />
      <div className="mb-3 flex gap-2">
        {(["7d", "30d", "all"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className="pill" style={{ background: p === period ? "var(--accent)" : "var(--panel-2)", color: p === period ? "#1a1200" : "var(--text)" }}>
            {p === "all" ? "All time" : p}
          </button>
        ))}
      </div>
      <p className="muted mb-3 text-xs">Realised PnL pulled straight from Hyperliquid fills. No screenshots, no claims — chain data only.</p>
      {isLoading && <p className="muted text-sm">Loading…</p>}
      {!isLoading && rows.length === 0 && <div className="panel p-6 text-center muted text-sm">No closed trades yet this period.</div>}
      <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
        {rows.map((r, i) => (
          <Link key={r.handle} href={`/u/${r.handle}`} className="flex items-center gap-3 p-3" style={{ borderColor: "var(--line)" }}>
            <span className="w-7 text-center text-lg">{medal[i] ?? <span className="muted text-sm">{i + 1}</span>}</span>
            <div className="flex-1 leading-tight">
              <div className="font-semibold">@{r.handle}</div>
              <div className="muted text-xs">{r.closedTrades} closed · {fmtPct(Number(r.winRate), 0)} win · vol {fmtUsd(Number(r.volume30d), { compact: true })}</div>
            </div>
            <div className={`font-mono font-bold ${r.pnl >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl, { sign: true, compact: true })}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

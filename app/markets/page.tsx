"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Header } from "@/components/Header";
import { Sparkline } from "@/components/Sparkline";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { MarketRow } from "@/lib/hl-info";
import { useMids } from "@/lib/hooks/useMids";

type Filter = "top" | "gainers" | "losers";

export default function MarketsPage() {
  const { data } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 30_000 });
  const { mids } = useMids();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("top");

  const rows = useMemo(() => {
    let list = data?.markets ?? [];
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
    if (filter === "gainers") list = [...list].sort((a, b) => b.change24h - a.change24h);
    if (filter === "losers") list = [...list].sort((a, b) => a.change24h - b.change24h);
    return list.slice(0, 60);
  }, [data, q, filter]);

  return (
    <>
      <Header title="Markets" right={<span className="muted text-xs">{data?.markets.length ?? "…"} perps</span>} />
      <input className="input mb-2.5" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-2.5 flex gap-1.5">
        {(["top", "gainers", "losers"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="pill capitalize" style={{ background: f === filter ? "var(--ink)" : "var(--panel-2)", color: f === filter ? "var(--ink-fg)" : "var(--text)" }}>{f}</button>
        ))}
      </div>
      <div className="panel px-4 py-1">
        {!data && <p className="muted py-3 text-sm">Loading markets…</p>}
        {rows.map((m, i) => {
          const px = mids[m.name] ?? m.mid;
          const up = m.change24h >= 0;
          return (
            <Link key={m.name} href={`/markets/${m.name}`} className="grid grid-cols-[1fr_60px_auto] items-center gap-3 py-3" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <div className="min-w-0">
                <div className="font-semibold">{m.name}</div>
                <div className="muted truncate text-[11px]">Vol {fmtUsd(m.volume24h, { compact: true })} · OI {fmtUsd(m.openInterest, { compact: true })} · {m.maxLeverage}×</div>
              </div>
              <Sparkline coin={m.name} up={up} />
              <div className="text-right">
                <div className="font-mono font-semibold">{px.toLocaleString("en-US", { maximumFractionDigits: 6 })}</div>
                <div className={`font-mono text-xs ${up ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

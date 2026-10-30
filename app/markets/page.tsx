"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Sparkline } from "@/components/Sparkline";
import { CoinMark, Icon, I, ticker } from "@/components/ui";
import { fmtPct, fmtUsd, fmtPrice } from "@/lib/format";
import type { MarketRow } from "@/lib/hl-info";
import { useMids } from "@/lib/hooks/useMids";
import type { FeedRow } from "@/lib/feed";

type Sort = "volume" | "gainers" | "losers" | "oi" | "funding" | "hot";

export default function MarketsPage() {
  const { data } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 30_000 });
  const { data: live } = useSWR<{ posts: FeedRow[] }>("/api/posts?tab=live&limit=50", { refreshInterval: 30_000 });
  const { mids } = useMids();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("volume");
  const [showSearch, setShowSearch] = useState(false);

  const liveByCoin = useMemo(() => {
    const m: Record<string, { n: number; longs: number }> = {};
    for (const p of live?.posts ?? []) { const c = p.post.coin!; m[c] = m[c] ?? { n: 0, longs: 0 }; m[c].n++; if (p.post.side === "long") m[c].longs++; }
    return m;
  }, [live]);
  const totalLive = Object.values(liveByCoin).reduce((a, b) => a + b.n, 0);
  const totalLongs = Object.values(liveByCoin).reduce((a, b) => a + b.longs, 0);

  const all = data?.markets ?? [];
  const totals = useMemo(() => ({ vol: all.reduce((a, m) => a + m.volume24h, 0), oi: all.reduce((a, m) => a + m.openInterest, 0) }), [all]);
  const movers = useMemo(() => [...all].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 8), [all]);
  const rows = useMemo(() => {
    let list = all;
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
    const by: Record<Sort, (a: MarketRow, b: MarketRow) => number> = {
      volume: (a, b) => b.volume24h - a.volume24h, gainers: (a, b) => b.change24h - a.change24h, losers: (a, b) => a.change24h - b.change24h,
      oi: (a, b) => b.openInterest - a.openInterest, funding: (a, b) => Math.abs(b.funding8h) - Math.abs(a.funding8h), hot: (a, b) => (liveByCoin[b.name]?.n ?? 0) - (liveByCoin[a.name]?.n ?? 0),
    };
    return [...list].sort(by[sort]).slice(0, 80);
  }, [all, q, sort, liveByCoin]);

  return (
    <div data-tint="blue" className="fade-in">
      <header className="flex items-center justify-between px-5 pt-4">
        <div><h1 className="h1 dot">Markets</h1><div className="when">{all.length || "…"} perps · Hyperliquid</div></div>
        <button className="iconbtn" aria-label="Search" onClick={() => setShowSearch((v) => !v)}><Icon d={I.search} /></button>
      </header>
      {showSearch && <div className="px-5 pt-3"><input className="field" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>}

      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="stat"><small>24h volume</small><div className="v mono">{fmtUsd(totals.vol, { compact: true })}</div></div>
          <div className="stat"><small>Open interest</small><div className="v mono">{fmtUsd(totals.oi, { compact: true })}</div></div>
          <div className="stat"><small>Perped live</small><div className="v mono">{totalLive}{totalLive > 0 && <span className="green ml-1 text-xs font-bold">{Math.round((totalLongs / totalLive) * 100)}% long</span>}</div></div>
        </div>
        <div className="eyebrow mb-2.5 mt-4">Movers · 24h</div>
      </div>
      <div className="hstrip">
        {movers.map((m) => (
          <Link key={m.name} href={`/markets/${m.name}`} className="hcard" style={{ width: 104, padding: "12px 14px", borderTop: `3px solid ${m.change24h >= 0 ? "var(--green)" : "var(--red)"}` }}>
            <div className="flex items-center gap-2"><CoinMark coin={m.name} size="sm" /><span className="name">{ticker(m.name)}</span></div>
            <div className={`mono text-lg font-bold ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</div>
            <div className="mono when">{fmtPrice(mids[m.name] ?? m.mid)}</div>
          </Link>
        ))}
      </div>

      <div className="seg px-5 pt-4 pb-2.5">
        {([["volume", "Volume"], ["gainers", "Gainers"], ["losers", "Losers"], ["oi", "Open interest"], ["funding", "Funding"], ["hot", "Hot on Perped"]] as [Sort, string][]).map(([k, l]) => (
          <button key={k} className={`chip ${sort === k ? "on" : ""}`} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>

      <div className="faint grid grid-cols-[1fr_96px_52px] gap-3 px-5 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider"><span>Market</span><span className="text-right">Price · 24h</span><span className="text-right">Fund.</span></div>
      {!data && <p className="muted px-5 py-4 text-sm">Loading markets…</p>}
      {rows.map((m) => {
        const px = mids[m.name] ?? m.mid, up = m.change24h >= 0, lv = liveByCoin[m.name];
        return (
          <Link key={m.name} href={`/markets/${m.name}`} className="hairline block px-5 py-3.5">
            <div className="grid grid-cols-[1fr_56px_auto_48px] items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CoinMark coin={m.name} />
                <div className="min-w-0">
                  <div className="name flex items-center gap-1.5">{ticker(m.name, true)} <span className="muted rounded-md px-1.5 text-[11px] font-bold" style={{ background: "var(--surface)" }}>{m.maxLeverage}×</span></div>
                  <div className="when truncate text-xs">Vol {fmtUsd(m.volume24h, { compact: true })} · OI {fmtUsd(m.openInterest, { compact: true })}</div>
                </div>
              </div>
              <Sparkline coin={m.name} up={up} />
              <div className="text-right"><div className="mono font-semibold">{fmtPrice(px)}</div><div className={`mono text-[13px] ${up ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</div></div>
              <div className={`mono text-right text-[13px] font-semibold ${m.funding8h >= 0 ? "green" : "red"}`}>{fmtPct(m.funding8h, 3)}</div>
            </div>
            {lv && <div className="when mt-2 flex gap-3.5 text-xs"><span>Perped <b style={{ color: "var(--text)" }}>{lv.n} live</b></span><span>L/S <b className="mono" style={{ color: "var(--text)" }}>{Math.round((lv.longs / lv.n) * 100)}/{100 - Math.round((lv.longs / lv.n) * 100)}</b></span></div>}
          </Link>
        );
      })}
      <p className="muted px-5 py-4 text-xs leading-relaxed">Prices and funding from Hyperliquid, updating live. L/S is the long/short split of open Perped positions on that market.</p>
    </div>
  );
}

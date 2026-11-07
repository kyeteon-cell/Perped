"use client";


import { tt } from "@/lib/i18n";
import { memo, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Sparkline } from "@/components/Sparkline";
import { CoinMark, Icon, I, ticker, SkeletonList, LoadFail } from "@/components/ui";
import { fmtPct, fmtUsd, fmtPrice, crowdLabel } from "@/lib/format";
import type { MarketItem as MarketRow } from "@/components/MarketStats";
import { useMid } from "@/lib/hooks/useMids";
import type { FeedRow } from "@/lib/feed";

type Group = "all" | "crypto" | "stocks";
const isStock = (m: { kind?: string }) => m.kind === "stock" || m.kind === "index";
type Sort = "volume" | "gainers" | "losers" | "oi" | "oirise" | "crowded" | "hot";

export default function MarketsPage() {
  const { data, error, mutate } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 60_000 });
  const { data: live } = useSWR<{ posts: FeedRow[] }>("/api/posts?tab=live&limit=50", { refreshInterval: 30_000 });
  const [sort, setSort] = useState<Sort>("volume");
  const [group, setGroup] = useState<Group>("all");

  const liveByCoin = useMemo(() => {
    const m: Record<string, { n: number; longs: number }> = {};
    for (const p of live?.posts ?? []) { const c = p.post.coin!; m[c] = m[c] ?? { n: 0, longs: 0 }; m[c].n++; if (p.post.side === "long") m[c].longs++; }
    return m;
  }, [live]);
  const totalLive = Object.values(liveByCoin).reduce((a, b) => a + b.n, 0);
  const totalLongs = Object.values(liveByCoin).reduce((a, b) => a + b.longs, 0);

  const every = data?.markets ?? [];
  const stockCount = useMemo(() => every.filter(isStock).length, [every]);
  const all = useMemo(() => group === "all" ? every : every.filter((m) => (group === "stocks") === isStock(m)), [every, group]);
  const totals = useMemo(() => ({ vol: all.reduce((a, m) => a + m.volume24h, 0), oi: all.reduce((a, m) => a + m.openInterest, 0) }), [all]);
  const movers = useMemo(() => [...all].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 8), [all]);
  const rows = useMemo(() => {
    const list = all;
    const by: Record<Sort, (a: MarketRow, b: MarketRow) => number> = {
      volume: (a, b) => b.volume24h - a.volume24h, gainers: (a, b) => b.change24h - a.change24h, losers: (a, b) => a.change24h - b.change24h,
      oi: (a, b) => b.openInterest - a.openInterest, oirise: (a, b) => (b.oiChange24h ?? -Infinity) - (a.oiChange24h ?? -Infinity) || b.volume24h - a.volume24h,
      crowded: (a, b) => Math.abs(b.funding8h - 0.01) - Math.abs(a.funding8h - 0.01), hot: (a, b) => (liveByCoin[b.name]?.n ?? 0) - (liveByCoin[a.name]?.n ?? 0),
    };
    return [...list].sort(by[sort]).slice(0, 80);
  }, [all, sort, liveByCoin]);

  return (
    <div data-tint="blue" className="fade-in">
      <header className="flex items-center justify-between px-5 pt-4">
        <div><h1 className="h1 dot">{tt("Markets")}</h1><div className="when">{every.length || "…"} perps{stockCount ? ` · ${stockCount} stocks` : ""}{" "}{tt("· Hyperliquid")}</div></div>
        <Link href="/search" className="iconbtn" aria-label={tt("Search")}><Icon d={I.search} /></Link>
      </header>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="stat"><small>{tt("24h volume")}</small><div className="v mono">{fmtUsd(totals.vol, { compact: true })}</div></div>
          <div className="stat"><small>{tt("Open interest")}</small><div className="v mono">{fmtUsd(totals.oi, { compact: true })}</div></div>
          <div className="stat"><small>{tt("Perped live")}</small><div className="v mono">{totalLive}{totalLive > 0 && <span className="green ml-1 text-xs font-bold">{Math.round((totalLongs / totalLive) * 100)}{tt("% long")}</span>}</div></div>
        </div>
        <div className="eyebrow mb-2.5 mt-4">{tt("Movers · 24h")}</div>
      </div>
      <div className="hstrip">
        {movers.map((m) => (
          <Link key={m.name} href={`/markets/${m.name}`} className={`hcard mover ${m.change24h >= 0 ? "up" : "down"}`}>
            <div className="flex min-w-0 items-center gap-2"><CoinMark coin={m.name} size="sm" /><span className="name min-w-0 truncate">{ticker(m.name)}</span></div>
            <div className={`mono text-lg font-bold ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</div>
            <div className="mono when"><LivePx coin={m.name} fallback={m.mid} /></div>
          </Link>
        ))}
      </div>

      <div className="seg px-5 pt-4">
        {([["all", tt("All")], ["crypto", tt("Crypto")], ["stocks", tt("Stocks")]] as [Group, string][]).map(([k, l]) => (
          <button key={k} className={`chip ${group === k ? "info" : ""}`} onClick={() => setGroup(k)}>{l}</button>
        ))}
      </div>
      <div className="seg px-5 pt-2.5 pb-2.5">
        {([["volume", tt("Volume")], ["gainers", tt("Gainers")], ["losers", tt("Losers")], ["oi", "Open interest"], ["oirise", "OI rising"], ["crowded", tt("Crowded")], ["hot", "Hot on Perped"]] as [Sort, string][]).map(([k, l]) => (
          <button key={k} className={`chip ${sort === k ? "on" : ""}`} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>

      <div className="faint grid grid-cols-[1fr_96px_64px] gap-3 px-5 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider"><span>{tt("Market")}</span><span className="text-right">{tt("Price · 24h")}</span><span className="text-right">{tt("Fund./yr")}</span></div>
      {!data?.markets?.length && (error || data) ? <LoadFail retry={() => mutate()} /> : !data && <SkeletonList n={6} card={false} />}
      {rows.map((m) => <MarketRowItem key={m.name} m={m} lv={liveByCoin[m.name]} />)}
      <p className="muted px-5 py-4 text-xs leading-relaxed">{tt("Prices and funding from Hyperliquid, updating live. Stocks are perps that track the share price, listed on Hyperliquid by builders such as TradeXYZ (HIP-3): they trade 24/7 with isolated margin, and give no shares, dividends or votes. Funding is shown per year (Hyperliquid pays it hourly). OI change compares open interest with 24 hours ago. L/S is the long/short split of open Perped positions on that market.")}</p>
    </div>
  );
}

/** Just the ticking price: the only part of a market row that changes every second. */
function LivePx({ coin, fallback }: { coin: string; fallback: number }) {
  return <>{fmtPrice(useMid(coin) ?? fallback)}</>;
}

const MarketRowItem = memo(function MarketRowItem({ m, lv }: { m: MarketRow; lv?: { n: number; longs: number } }) {
  const up = m.change24h >= 0;
  return (
        <Link href={`/markets/${m.name}`} className="hairline block px-5 py-3.5">
          <div className="grid grid-cols-[1fr_56px_auto_64px] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <CoinMark coin={m.name} />
              <div className="min-w-0">
                <div className="name flex items-center gap-1.5">{ticker(m.name, true)} <span className="muted rounded-md px-1.5 text-[11px] font-bold" style={{ background: "var(--surface)" }}>{m.maxLeverage}×</span>{isStock(m) && <span className="muted rounded-md px-1.5 text-[11px] font-bold" style={{ background: "var(--surface)" }}>{m.kind === "index" ? tt("Index") : tt("Stock")}</span>}</div>
                <div className="when truncate text-xs">{tt("Vol")}{" "}{fmtUsd(m.volume24h, { compact: true })}{" "}{tt("· OI")}{" "}{fmtUsd(m.openInterest, { compact: true })}{m.oiChange24h != null && <span className="mono"> {fmtPct(m.oiChange24h, 1)}</span>}</div>
              </div>
            </div>
            <Sparkline coin={m.name} up={up} />
            <div className="text-right"><div className="mono font-semibold"><LivePx coin={m.name} fallback={m.mid} /></div><div className={`mono text-[13px] ${up ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</div></div>
            <div className="text-right"><div className="mono text-[13px] font-semibold">{(m.funding8h * 3 * 365).toFixed(1)}%</div>{crowdLabel(m.funding8h) && <div className="when text-[10.5px] leading-tight">{crowdLabel(m.funding8h)}</div>}</div>
          </div>
          {lv && <div className="when mt-2 flex gap-3.5 text-xs"><span>{tt("Perped")}{" "}<b style={{ color: "var(--text)" }}>{lv.n} live</b></span><span>L/S <b className="mono" style={{ color: "var(--text)" }}>{Math.round((lv.longs / lv.n) * 100)}/{100 - Math.round((lv.longs / lv.n) * 100)}</b></span></div>}
        </Link>
  );
});

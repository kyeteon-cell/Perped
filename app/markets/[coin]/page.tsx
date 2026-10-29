"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PriceChart } from "@/components/PriceChart";
import { TradeTicket } from "@/components/TradeTicket";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { MarketRow } from "@/lib/hl-info";
import { useMids } from "@/lib/hooks/useMids";
import type { FeedItem } from "@/components/FeedPost";

export default function MarketPage({ params }: { params: Promise<{ coin: string }> }) {
  const { coin: raw } = use(params);
  const coin = raw.toUpperCase();
  const { data } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 30_000 });
  const { data: feed } = useSWR<{ posts: FeedItem[] }>(`/api/posts?coin=${coin}&status=open`);
  const { mids } = useMids();
  const m = data?.markets.find((x) => x.name === coin);
  const px = mids[coin] ?? m?.mid ?? 0;
  const live = feed?.posts ?? [];
  const longs = live.filter((p) => p.post.side === "long").length;

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <Link href="/markets" className="muted text-sm">‹ Markets</Link>
      </header>

      <section className="panel p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight">{coin} <span className="muted text-xs font-medium">{coin}-USD perp</span></div>
            <div className="mt-0.5 font-mono text-[26px] font-semibold tracking-tight">
              {px ? px.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "…"}
              {m && <span className={`ml-2 text-[13px] font-medium ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</span>}
            </div>
          </div>
        </div>
        <div className="mt-2"><PriceChart coin={coin} livePx={px || undefined} /></div>
        {m && (
          <div className="muted mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <div>24h volume<br /><span className="font-mono text-[13px]" style={{ color: "var(--text)" }}>{fmtUsd(m.volume24h, { compact: true })}</span></div>
            <div>Open interest<br /><span className="font-mono text-[13px]" style={{ color: "var(--text)" }}>{fmtUsd(m.openInterest, { compact: true })}</span></div>
            <div>Funding / 8h<br /><span className="font-mono text-[13px]" style={{ color: "var(--text)" }}>{fmtPct(m.funding8h, 4)}</span></div>
          </div>
        )}
        {live.length > 0 && (
          <div className="muted mt-3 flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: "var(--line)" }}>
            <span>{live.length} Perped trader{live.length === 1 ? "" : "s"} live · {longs} long, {live.length - longs} short</span>
            <span className={longs >= live.length / 2 ? "green" : "red"}>{Math.round((longs / live.length) * 100)}% long</span>
          </div>
        )}
      </section>

      <div className="mt-3"><TradeTicket seed={{ coin }} compact /></div>
    </>
  );
}

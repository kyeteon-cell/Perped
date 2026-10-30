"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PriceChart } from "@/components/PriceChart";
import { MarketTape, SentimentRibbon, useMarketTraders, pick, toMarkers, type Lens } from "@/components/MarketTape";
import { TradeTicket } from "@/components/TradeTicket";
import { FeedPost } from "@/components/FeedPost";
import { CoinMark, Icon, I, ticker } from "@/components/ui";
import { fmtPct, fmtUsd, fmtPrice } from "@/lib/format";
import type { MarketRow } from "@/lib/hl-info";
import { useMids } from "@/lib/hooks/useMids";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";

export default function MarketPage({ params }: { params: Promise<{ coin: string }> }) {
  const { coin: raw } = use(params);
  const coin = raw.toUpperCase();
  const { profile } = useSession();
  const { data } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 30_000 });
  const { data: feed, mutate } = useSWR<{ posts: FeedRow[] }>(`/api/posts?coin=${coin}&limit=20`, { refreshInterval: 20_000 });
  const { data: me } = useSWR<{ stats: { closedTrades: number } | null }>(profile ? `/api/profile/${profile.handle}` : null);
  const { mids } = useMids();
  const m = data?.markets.find((x) => x.name === coin);
  const px = mids[coin] ?? m?.mid ?? 0;
  const live = (feed?.posts ?? []).filter((p) => p.post.kind === "trade" && p.post.status === "open");
  const longs = live.filter((p) => p.post.side === "long").length;

  // Social overlay: who's in this market (followed / top / everyone), as chart pins + a live tape.
  const { traders, followingAny, loaded } = useMarketTraders(coin);
  const [lens, setLens] = useState<Lens>(() => { try { return (localStorage.getItem("perped:lens") as Lens) || "following"; } catch { return "following"; } });
  useEffect(() => { try { localStorage.setItem("perped:lens", lens); } catch {} }, [lens]);
  // Default to Top 10 for people who don't follow anyone yet.
  useEffect(() => { if (loaded && !followingAny && lens === "following") setLens("top"); }, [loaded, followingAny, lens]);
  const [selected, setSelected] = useState<string | null>(null);
  const markers = useMemo(() => toMarkers(pick(traders, lens)), [traders, lens]);

  return (
    <div data-tint="blue" className="fade-in">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/markets" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link>
        <span className="mono when">{m ? `Funding ${fmtPct(m.funding8h, 3)} / 8h` : ""}</span>
      </header>

      <section className="px-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5"><CoinMark coin={coin} /><div className="text-[30px] font-bold leading-none tracking-tight">{ticker(coin, true)}</div></div>
            <div className="mono mt-2.5 text-[22px] font-semibold">{px ? fmtPrice(px) : "…"}{m && <span className={`ml-2 text-sm font-semibold ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</span>}</div>
          </div>
        </div>
        <div className="mt-3"><SentimentRibbon traders={traders} followingAny={followingAny} /></div>
        <div className="mt-3"><PriceChart coin={coin} livePx={px || undefined} markers={markers} onMarkerClick={(id) => setSelected(id)} /></div>
        <MarketTape coin={coin} traders={traders} lens={lens} setLens={setLens} followingAny={followingAny} mid={px} selected={selected} onSelect={setSelected} meId={profile?.id} />
        {m && (
          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <div className="stat"><small>24h volume</small><div className="v mono">{fmtUsd(m.volume24h, { compact: true })}</div></div>
            <div className="stat"><small>Open interest</small><div className="v mono">{fmtUsd(m.openInterest, { compact: true })}</div></div>
            <div className="stat"><small>Max leverage</small><div className="v mono">{m.maxLeverage}×</div></div>
          </div>
        )}
        {live.length > 0 && <div className="mt-3.5 flex items-center justify-between text-sm"><span className="muted">{live.length} Perped trader{live.length === 1 ? "" : "s"} live</span><span className={`font-bold ${longs >= live.length / 2 ? "green" : "red"}`}>{Math.round((longs / live.length) * 100)}% long</span></div>}
      </section>

      <div className="mt-2 hairline" />
      <TradeTicket seed={{ coin, closedTrades: me?.stats?.closedTrades ?? 0 }} compact />

      {(feed?.posts.length ?? 0) > 0 && (
        <section className="mt-2" data-tint="brand">
          <div className="eyebrow px-5 pb-2 pt-4">Perped on {ticker(coin)}</div>
          {feed!.posts.map((item) => <FeedPost key={item.post.id} item={item} mid={px || undefined} onChanged={() => mutate()} />)}
        </section>
      )}
    </div>
  );
}

"use client";


import { tt } from "@/lib/i18n";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PriceChart } from "@/components/PriceChart";
import { MarketTape, SentimentRibbon, useMarketTraders, pick, toMarkers, type Lens } from "@/components/MarketTape";
import { TradeTicket } from "@/components/TradeTicket";
import { FeedPost } from "@/components/FeedPost";
import { CoinMark, Icon, I, ticker } from "@/components/ui";
import { fmtPct, fmtPrice, normCoin } from "@/lib/format";
import { useMids } from "@/lib/hooks/useMids";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { CoinAbout, coinName } from "@/components/CoinAbout";
import { MarketStats, useCoinStats, useFundingCountdown, type MarketItem } from "@/components/MarketStats";

export default function MarketPage({ params }: { params: Promise<{ coin: string }> }) {
  const { coin: raw } = use(params);
  const { profile } = useSession();
  const { data } = useSWR<{ markets: MarketItem[] }>("/api/markets", { refreshInterval: 60_000 });
  // Hyperliquid names are case-sensitive and the 1000x markets keep a lower-case "k" (kPEPE, kBONK). Never upper-case
  // the whole thing: match the listed market case-insensitively, falling back to the normalised name while it loads.
  const asked = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
  const coin = data?.markets?.find((x) => x.name.toLowerCase() === asked.toLowerCase())?.name ?? normCoin(asked);
  const { data: cs } = useCoinStats(coin);
  const countdown = useFundingCountdown();
  const guides = useMemo(() => (cs?.typical ? [{ price: cs.typical.high, label: tt("Typical high") }, { price: cs.typical.low, label: tt("Typical low") }] : []), [cs]);
  const { data: feed, mutate } = useSWR<{ posts: FeedRow[] }>(`/api/posts?coin=${coin}&limit=20`, { refreshInterval: 20_000 });
  const { data: me } = useSWR<{ stats: { closedTrades: number } | null }>(profile ? `/api/profile/${profile.handle}` : null);
  const { mids } = useMids();
  const m = data?.markets?.find((x) => x.name === coin);
  const px = mids[coin] ?? m?.mid ?? 0;
  const live = (feed?.posts ?? []).filter((p) => p.post.kind === "trade" && p.post.status === "open");
  const longs = live.filter((p) => p.post.side === "long").length;

  // Social overlay: who's in this market (followed / top / everyone), as chart pins + a live tape.
  const { traders, followingAny, loaded } = useMarketTraders(coin);
  const [lens, setLens] = useState<Lens>("following");
  useEffect(() => { try { const l = localStorage.getItem("perped:lens") as Lens | null; if (l) setLens(l); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("perped:lens", lens); } catch {} }, [lens]);
  // Default to Top 10 for people who don't follow anyone yet.
  useEffect(() => { if (loaded && !followingAny && lens === "following") setLens("top"); }, [loaded, followingAny, lens]);
  const [selected, setSelected] = useState<string | null>(null);
  const markers = useMemo(() => toMarkers(pick(traders, lens)), [traders, lens]);

  // Unknown coin (typo or delisted): say so instead of showing a trade ticket for a market that doesn't exist.
  if (data?.markets?.length && !m) return (
    <div data-tint="blue" className="fade-in">
      <header className="flex items-center px-4 py-3"><Link href="/markets" className="iconbtn" aria-label={tt("Back")}><Icon d={I.back} /></Link></header>
      <div className="load-fail"><b>{tt("No market called")}{" "}{coin}</b><span>{tt("Hyperliquid doesn't list it right now.")}</span><Link href="/markets" className="chip mt-3">{tt("All markets")}</Link></div>
    </div>
  );
  return (
    <div data-tint="blue" className="fade-in">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/markets" className="iconbtn" aria-label={tt("Back")}><Icon d={I.back} /></Link>
        <span className="mono when">{tt("Next funding")}{" "}{countdown}</span>
      </header>

      <section className="px-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5"><CoinMark coin={coin} /><div className="text-[30px] font-bold leading-none tracking-tight">{ticker(coin, true)}</div></div>
            {coinName(coin) && <div className="mk-name">{coinName(coin)}</div>}
            <div className="mono mt-2.5 text-[22px] font-semibold">{px ? fmtPrice(px) : "…"}{m && <span className={`ml-2 text-sm font-semibold ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</span>}</div>
          </div>
        </div>
        <div className="mt-3"><SentimentRibbon traders={traders} followingAny={followingAny} /></div>
        <div className="mt-3"><PriceChart coin={coin} livePx={px || undefined} markers={markers} onMarkerClick={(id) => setSelected(id)} guides={guides} /></div>
        <MarketTape coin={coin} traders={traders} lens={lens} setLens={setLens} followingAny={followingAny} mid={px} selected={selected} onSelect={setSelected} meId={profile?.id} />
        {m && <div className="mt-3.5"><MarketStats coin={coin} m={m} /></div>}
        {coinName(coin) && <div className="mt-3.5"><CoinAbout coin={coin} /></div>}
        {live.length > 0 && <div className="mt-3.5 flex items-center justify-between text-sm"><span className="muted">{live.length}{" "}{tt("Perped trader")}{live.length === 1 ? "" : "s"} live</span><span className={`font-bold ${longs >= live.length / 2 ? "green" : "red"}`}>{Math.round((longs / live.length) * 100)}{tt("% long")}</span></div>}
      </section>

      <div className="mt-2 hairline" />
      <TradeTicket seed={{ coin, closedTrades: me?.stats?.closedTrades ?? 0 }} compact />

      {(feed?.posts?.length ?? 0) > 0 && (
        <section className="mt-2" data-tint="brand">
          <div className="eyebrow px-5 pb-2 pt-4">{tt("Perped on")}{" "}{ticker(coin)}</div>
          {feed!.posts.map((item) => <FeedPost key={item.post.id} item={item} mid={px || undefined} onChanged={mutate} />)}
        </section>
      )}
    </div>
  );
}

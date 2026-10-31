"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost, RankStrip, isDemoPost } from "@/components/FeedPost";
import { Hero } from "@/components/Hero";
import { Pulse } from "@/components/Pulse";
import { QuickCall } from "@/components/QuickCall";
import { QuickPost } from "@/components/QuickPost";
import { FollowButton } from "@/components/FollowButton";
import { FeedFilters, EMPTY_FILTER, activeCount, filterQuery, filterSummary, type FeedFilter } from "@/components/FeedFilters";
import { Banked } from "@/components/Banked";
import { DepositSheet } from "@/components/DepositSheet";
import { Avatar, Icon, I, SkeletonList } from "@/components/ui";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtUsd, fmtPct } from "@/lib/format";

type Tab = "foryou" | "following" | "live";

/** Only live trades and open calls need the ticking price; closed cards stay still. */
const isLive = (p: FeedRow["post"]) => (p.kind === "trade" ? p.status === "open" : p.kind === "call" && p.callStatus === "open");

export default function HomePage() {
  const { authenticated, profile, authedFetch, unread } = useSession();
  const { mids, connected } = useMids();
  const liveMid = (it: FeedRow) => (it.post.coin && isLive(it.post) ? mids[it.post.coin] : undefined);
  const [tab, setTab] = useState<Tab>("foryou");
  const [realness, setRealness] = useState<"all" | "real" | "demo">("all");
  const setRealnessP = (v: "all" | "real" | "demo") => { setRealness(v); try { localStorage.setItem("perped:realness", v); } catch {} };
  const [deposit, setDeposit] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FILTER);
  const [filtering, setFiltering] = useState(false);
  // Saved choices load after mount (reading storage during render breaks hydration).
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const r = localStorage.getItem("perped:realness") as "all" | "real" | "demo" | null; if (r) setRealness(r);
      setFilter({ ...EMPTY_FILTER, ...JSON.parse(localStorage.getItem("perped:filter") || "{}") });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem("perped:filter", JSON.stringify(filter)); } catch {} }, [filter, loaded]);
  const nFilters = activeCount(filter);
  // Referral links land here (/?ref=handle). Remember the code until onboarding uses it.
  useEffect(() => {
    try { const ref = new URLSearchParams(window.location.search).get("ref"); if (ref) localStorage.setItem("perped:ref", ref.toLowerCase()); } catch {}
  }, []);
  const key = `/api/posts?tab=${tab}${filterQuery(filter)}`;
  const { data, mutate, isLoading } = useSWR<{ posts: FeedRow[] }>(key, async () => (await authedFetch(key)).json(), { refreshInterval: 15_000 });
  const allPosts = data?.posts ?? [];
  const posts = realness === "all" ? allPosts : allPosts.filter((p) => p.post.kind !== "trade" || (realness === "demo") === isDemoPost(p));
  const { data: board } = useSWR<{ rows: { handle: string; pnl: number; winRate: string }[] }>("/api/leaderboard?period=7d");
  const suggested = (board?.rows ?? []).filter((r) => r.handle !== profile?.handle).slice(0, 5);

  return (
    <div data-tint="brand" className="fade-in">
      <header className="home-banner">
        <img src="/api/share-bg/banner-mercury" alt="" className="home-banner-img" />
        <div className="home-banner-shade" />
        <div className="home-banner-row">
        <div>
          <h1 className="m-0"><img src="/api/share-bg/logo-wordmark" alt="perped" className="logo-wordmark" /></h1>
          <div className="home-banner-sub">Powered by Hyperliquid</div>
        </div>
        <div className="flex gap-2">
          {authenticated && (
            <Link href="/notifications" className="iconbtn glass" aria-label="Notifications"><Icon d={I.bell} />{unread > 0 && <span className="badge">{unread}</span>}</Link>
          )}
          <Link href="/markets" className="iconbtn glass" aria-label="Search"><Icon d={I.search} /></Link>
        </div>
        </div>
      </header>

      <div className="tabs mt-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(["foryou", "following", "live"] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
            {t === "foryou" ? "For you" : t === "following" ? "Following" : <>Live {connected && <span className="dot" />}</>}
          </button>
        ))}
      </div>

      {tab === "foryou" && <Hero onDeposit={() => setDeposit(true)} />}
      {tab === "foryou" && <QuickCall mids={mids} />}
      {tab !== "live" && <QuickPost onPosted={() => mutate()} />}
      {tab !== "following" && <Pulse mids={mids} />}
      {tab === "foryou" && <Banked />}

      <div className="realness">
        {(["all", "real", "demo"] as const).map((v) => <button key={v} className={`chip ${realness === v ? (v === "demo" ? "on demo-on" : v === "real" ? "on real-on" : "on") : ""}`} onClick={() => setRealnessP(v)}>{v === "all" ? "All trades" : v === "real" ? "Real money" : "Demo"}</button>)}
        <button className={`chip ml-auto ${nFilters ? "on" : ""}`} onClick={() => setFiltering(true)}><Icon d={I.list} size={14} />Filter{nFilters ? ` · ${nFilters}` : ""}</button>
      </div>
      {nFilters > 0 && <div className="flex items-center gap-2 px-5 pb-1"><span className="when truncate">{filterSummary(filter)}</span><button className="when ml-auto underline" onClick={() => setFilter(EMPTY_FILTER)}>clear</button></div>}
      {filtering && <FeedFilters value={filter} onChange={setFilter} onClose={() => setFiltering(false)} />}

      {isLoading && posts.length === 0 && <SkeletonList n={3} />}
      {!isLoading && posts.length === 0 && (
        <div className="block text-center" style={{ padding: "36px 24px" }}>
          <h3 className="text-xl font-bold tracking-tight">{nFilters ? "Nothing matches those filters" : tab === "following" ? "Nobody you follow has posted yet" : "Your feed is quiet"}</h3>
          {nFilters > 0 && <button className="chip mt-3" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>}
          <p className="muted mx-auto mt-1.5 max-w-[28ch]">{tab === "following" ? "Follow a few traders and their trades show up here live." : "Open the first position and it shows up here for everyone to copy, fade, cheer or roast."}</p>
          {tab === "following" ? null : <Link href="/markets" className="copy mt-4 inline-block">Place the first trade</Link>}
        </div>
      )}
      {!isLoading && posts.length === 0 && tab === "following" && suggested.length > 0 && <Suggested rows={suggested} />}

      {groupFeed(posts).map((g, i) => (
        <div key={g.kind === "strip" ? `strip-${g.items[0].post.id}` : g.item.post.id}>
          {g.kind === "strip" ? <RankStrip items={g.items} /> : <FeedPost item={g.item} mid={liveMid(g.item)} onChanged={mutate} />}
          {i === 4 && suggested.length > 0 && <Suggested rows={suggested} />}
        </div>
      ))}

      {posts.length > 0 && posts.length < 5 && suggested.length > 0 && <Suggested rows={suggested} />}
      {deposit && <DepositSheet onClose={() => setDeposit(false)} />}
    </div>
  );
}

/** Runs of two or more milestone / rank system posts become one horizontal strip. */
function groupFeed(rows: FeedRow[]): Array<{ kind: "one"; item: FeedRow } | { kind: "strip"; items: FeedRow[] }> {
  const out: Array<{ kind: "one"; item: FeedRow } | { kind: "strip"; items: FeedRow[] }> = [];
  const isSmall = (r: FeedRow) => r.post.kind === "system" && (r.post.systemType === "milestone" || r.post.systemType === "rank");
  for (let i = 0; i < rows.length; i++) {
    if (isSmall(rows[i])) {
      const run = [rows[i]];
      while (i + 1 < rows.length && isSmall(rows[i + 1])) run.push(rows[++i]);
      if (run.length >= 2) { out.push({ kind: "strip", items: run }); continue; }
      out.push({ kind: "one", item: run[0] });
      continue;
    }
    out.push({ kind: "one", item: rows[i] });
  }
  return out;
}

function Suggested({ rows }: { rows: { handle: string; pnl: number; winRate: string }[] }) {
  return (
    <div className="hairline py-4" data-tint="violet">
      <div className="flex items-center justify-between px-5"><span className="eyebrow">Traders like you</span><span className="when">doing well this week</span></div>
      <div className="hstrip mt-3">
        {rows.map((r) => (
          <div key={r.handle} className="hcard violet text-center" style={{ width: 140 }}>
            <div className="flex justify-center"><Avatar handle={r.handle} size={48} /></div>
            <Link href={`/u/${r.handle}`} className="name mt-2 block">{r.handle}</Link>
            <div className="when">{fmtUsd(r.pnl, { sign: true, compact: true })} · {fmtPct(Number(r.winRate), 0)} win</div>
            <div className="mt-2.5"><FollowButton handle={r.handle} compact className="!ml-0 w-full" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

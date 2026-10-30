"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost } from "@/components/FeedPost";
import { Hero } from "@/components/Hero";
import { DepositSheet } from "@/components/DepositSheet";
import { Avatar, Icon, I } from "@/components/ui";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtUsd, fmtPct } from "@/lib/format";

type Tab = "foryou" | "following" | "live";

export default function HomePage() {
  const { authenticated, profile, authedFetch, unread } = useSession();
  const { mids, connected } = useMids();
  const [tab, setTab] = useState<Tab>("foryou");
  const [deposit, setDeposit] = useState(false);
  const key = `/api/posts?tab=${tab}`;
  const { data, mutate, isLoading } = useSWR<{ posts: FeedRow[] }>(key, async () => (await authedFetch(key)).json(), { refreshInterval: 15_000 });
  const posts = data?.posts ?? [];
  const { data: board } = useSWR<{ rows: { handle: string; pnl: number; winRate: string }[] }>("/api/leaderboard?period=7d");
  const suggested = (board?.rows ?? []).filter((r) => r.handle !== profile?.handle).slice(0, 5);

  return (
    <div data-tint="brand" className="fade-in">
      <header className="flex items-center justify-between px-5 pt-4">
        <div>
          <h1 className="h1">Perped</h1>
          <div className="faint text-[11px] font-semibold uppercase tracking-wide">Powered by Hyperliquid</div>
        </div>
        <div className="flex gap-2">
          {authenticated && (
            <Link href="/notifications" className="iconbtn" aria-label="Notifications"><Icon d={I.bell} />{unread > 0 && <span className="badge">{unread}</span>}</Link>
          )}
          <Link href="/markets" className="iconbtn" aria-label="Search"><Icon d={I.search} /></Link>
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

      {isLoading && <p className="muted px-5 py-6 text-sm">Loading…</p>}
      {!isLoading && posts.length === 0 && (
        <div className="block text-center" style={{ padding: "36px 24px" }}>
          <h3 className="text-xl font-bold tracking-tight">{tab === "following" ? "Nobody you follow has posted yet" : "Your feed is quiet"}</h3>
          <p className="muted mx-auto mt-1.5 max-w-[28ch]">{tab === "following" ? "Follow a few traders and their trades show up here live." : "Open the first position and it shows up here for everyone to copy, fade, cheer or roast."}</p>
          <Link href="/markets" className="copy mt-4 inline-block">Place the first trade</Link>
        </div>
      )}

      {posts.map((item, i) => (
        <div key={item.post.id}>
          <FeedPost item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={() => mutate()} />
          {i === 4 && suggested.length > 0 && <Suggested rows={suggested} />}
        </div>
      ))}

      {posts.length > 0 && posts.length < 5 && suggested.length > 0 && <Suggested rows={suggested} />}
      {deposit && <DepositSheet onClose={() => setDeposit(false)} />}
    </div>
  );
}

function Suggested({ rows }: { rows: { handle: string; pnl: number; winRate: string }[] }) {
  const { authedFetch, authenticated, login } = useSession();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const follow = async (h: string) => {
    if (!authenticated) return login();
    const r = await authedFetch("/api/follows", { method: "POST", body: JSON.stringify({ handle: h }) });
    if (r.ok) setDone((d) => ({ ...d, [h]: (await r.json()).following }));
  };
  return (
    <div className="hairline py-4" data-tint="violet">
      <div className="flex items-center justify-between px-5"><span className="eyebrow">Traders like you</span><span className="when">doing well this week</span></div>
      <div className="hstrip mt-3">
        {rows.map((r) => (
          <div key={r.handle} className="hcard violet text-center" style={{ width: 140 }}>
            <div className="flex justify-center"><Avatar handle={r.handle} size={48} /></div>
            <Link href={`/u/${r.handle}`} className="name mt-2 block">{r.handle}</Link>
            <div className="when">{fmtUsd(r.pnl, { sign: true, compact: true })} · {fmtPct(Number(r.winRate), 0)} win</div>
            <button className={`chip follow mt-2.5 w-full justify-center ${done[r.handle] ? "on" : ""}`} onClick={() => follow(r.handle)}>{done[r.handle] ? "Following" : "Follow"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

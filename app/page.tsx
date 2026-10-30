"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost, RankStrip, isDemoPost } from "@/components/FeedPost";
import { Hero } from "@/components/Hero";
import { Pulse } from "@/components/Pulse";
import { Banked } from "@/components/Banked";
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
  const [realness, setRealness] = useState<"all" | "real" | "demo">(() => { try { return (localStorage.getItem("perped:realness") as "all" | "real" | "demo") || "all"; } catch { return "all"; } });
  const setRealnessP = (v: "all" | "real" | "demo") => { setRealness(v); try { localStorage.setItem("perped:realness", v); } catch {} };
  const [deposit, setDeposit] = useState(false);
  // Referral links land here (/?ref=handle). Remember the code until onboarding uses it.
  useEffect(() => {
    try { const ref = new URLSearchParams(window.location.search).get("ref"); if (ref) localStorage.setItem("perped:ref", ref.toLowerCase()); } catch {}
  }, []);
  const key = `/api/posts?tab=${tab}`;
  const { data, mutate, isLoading } = useSWR<{ posts: FeedRow[] }>(key, async () => (await authedFetch(key)).json(), { refreshInterval: 15_000 });
  const allPosts = data?.posts ?? [];
  const posts = realness === "all" ? allPosts : allPosts.filter((p) => p.post.kind !== "trade" || (realness === "demo") === isDemoPost(p));
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
      {tab !== "following" && <Pulse mids={mids} />}
      {tab === "foryou" && <Banked />}

      <div className="realness">
        {(["all", "real", "demo"] as const).map((v) => <button key={v} className={`chip ${realness === v ? (v === "demo" ? "on demo-on" : v === "real" ? "on real-on" : "on") : ""}`} onClick={() => setRealnessP(v)}>{v === "all" ? "All trades" : v === "real" ? "Real money" : "Demo"}</button>)}
        <span className="when ml-auto">{realness === "all" ? "" : realness === "real" ? "showing live trades only" : "showing practice trades only"}</span>
      </div>

      {isLoading && <p className="muted px-5 py-6 text-sm">Loading…</p>}
      {!isLoading && posts.length === 0 && (
        <div className="block text-center" style={{ padding: "36px 24px" }}>
          <h3 className="text-xl font-bold tracking-tight">{tab === "following" ? "Nobody you follow has posted yet" : "Your feed is quiet"}</h3>
          <p className="muted mx-auto mt-1.5 max-w-[28ch]">{tab === "following" ? "Follow a few traders and their trades show up here live." : "Open the first position and it shows up here for everyone to copy, fade, cheer or roast."}</p>
          <Link href="/markets" className="copy mt-4 inline-block">Place the first trade</Link>
        </div>
      )}

      {groupFeed(posts).map((g, i) => (
        <div key={g.kind === "strip" ? `strip-${g.items[0].post.id}` : g.item.post.id}>
          {g.kind === "strip" ? <RankStrip items={g.items} /> : <FeedPost item={g.item} mid={g.item.post.coin ? mids[g.item.post.coin] : undefined} onChanged={() => mutate()} />}
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
  const { authedFetch, authenticated, login } = useSession();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const follow = async (h: string) => {
    if (!authenticated) return login();
    const r = await authedFetch("/api/follows", { method: "POST", body: JSON.stringify({ handle: h }) });
    if (r.ok) { const j = await r.json(); setDone((d) => ({ ...d, [h]: j.following })); }
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

"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost } from "@/components/FeedPost";
import { DepositSheet } from "@/components/DepositSheet";
import { ChallengeSheet } from "@/components/ChallengeSheet";
import { PerformanceCard } from "@/components/Performance";
import { Avatar, CoinMark, Icon, I, ticker, SkeletonList, RankChip } from "@/components/ui";
import { RankCard } from "@/components/RankCard";
import { useDemoEquity } from "@/lib/hooks/useDemoEquity";
import { FollowButton } from "@/components/FollowButton";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PinCard } from "@/components/PinCard";
import type { RivalRow } from "@/app/api/rivalries/route";
import { useMids } from "@/lib/hooks/useMids";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { makeExchangeClient, closePosition } from "@/lib/hl-exchange";
import { fmtUsd, fmtPct, fmtPrice } from "@/lib/format";
import type { User, Stats } from "@/lib/schema";
import type { AssetPosition } from "@/lib/hl-info";
import type { FeedRow } from "@/lib/feed";

type ProfileRes = { battleStreak?: number; bestStreak?: number; user: User; stats: Stats | null; followers: number; following: number; rivalries: { opponent: string; wins: number; losses: number }[]; isFollowing: boolean; isMe: boolean; positions: AssetPosition[]; accountValue: number | null; withdrawable: number | null; xpRecent?: { delta: number; reason: string; ref: string | null; createdAt: string }[] };
type Tab = "activity" | "trades" | "posts" | "people";
type People = "followers" | "following";

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { data, mutate } = useSWR<ProfileRes>(`/api/profile/${handle}`, { refreshInterval: 20_000 });
  const { authedFetch, walletClient, authenticated, login, fee } = useSession();
  const { mids } = useMids();
  const { markets } = useMarkets();
  const [tab, setTab] = useState<Tab>("activity");
  const [people, setPeopleDir] = useState<People>("followers");
  const [tradeTab, setTradeTab] = useState<"open" | "closed">("open");
  const [sheet, setSheet] = useState<"deposit" | "withdraw" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(false);

  const postsKey = tab === "posts" ? `/api/posts?handle=${handle}&kind=text` : tab === "trades" ? `/api/posts?handle=${handle}&kind=trade&status=${tradeTab}` : null;
  const { data: feed, mutate: mutateFeed } = useSWR<{ posts: FeedRow[] }>(postsKey);
  const { data: calls } = useSWR<{ posts: FeedRow[] }>(tab === "posts" ? `/api/posts?handle=${handle}&kind=call&limit=10` : null);
  const { data: theirRivals } = useSWR<{ rivals: RivalRow[] }>(`/api/rivalries?handle=${handle}`);
  const { profile: viewer } = useSession();
  const { data: myRivals, mutate: mutateMyRivals } = useSWR<{ rivals: RivalRow[] }>(viewer && viewer.handle !== handle ? `/api/rivalries?handle=${viewer.handle}` : null);
  const vsMe = myRivals?.rivals.find((r) => r.handle === handle.toLowerCase());
  const callOutRival = async () => { if (!authenticated) return login(); await authedFetch("/api/rivalries", { method: "POST", body: JSON.stringify({ handle, action: "call" }) }); mutateMyRivals(); };
  const { data: pinned, mutate: mutatePinned } = useSWR<{ posts: FeedRow[] }>(`/api/posts?handle=${handle}&kind=trade&limit=60`);
  const { data: peopleList } = useSWR<{ users: { handle: string; avatarUrl: string | null; pnl7d: string | null; winRate: string | null }[] }>(tab === "people" ? `/api/follows?handle=${handle}&dir=${people}` : null);

  const demoEq = useDemoEquity(data?.user?.isDemo ? data.user.handle : null, Number(data?.user?.demoBalance ?? 0), mids);
  if (!data) return <SkeletonList n={2} />;
  if ("error" in (data as unknown as Record<string, unknown>)) return <div className="p-5"><p className="muted">No trader with that handle.</p></div>;
  const { user, stats: s, isMe } = data;
  const roiOf = (p: FeedRow) => { const entry = Number(p.post.entryPx); const mark = p.post.status === "open" ? (mids[p.post.coin ?? ""] ?? entry) : Number(p.post.exitPx ?? entry); return ((mark - entry) / entry) * 100 * (p.post.side === "long" ? 1 : -1) * (p.post.leverage ?? 1); };
  const wonBattle = (p: FeedRow) => (p.post.meta as { battle?: { won: boolean | null } } | null)?.battle?.won === true;
  const closedAll = (pinned?.posts ?? []).filter((p) => p.post.status === "closed");
  const pinsOnly = (pinned?.posts ?? []).filter((p) => p.post.pinned);
  // Always something in view: pinned trades if they've chosen any, otherwise their best results (battle wins first).
  const pins = pinsOnly.length ? pinsOnly : [...closedAll].sort((a, b) => Number(wonBattle(b)) - Number(wonBattle(a)) || roiOf(b) - roiOf(a)).slice(0, 6);
  const showingTop = pinsOnly.length === 0;
  const callHit = s && s.callsResolved ? (s.callsHit / s.callsResolved) * 100 : null;

  const closePos = async (p: AssetPosition, fraction: number) => {
    if (!walletClient) return;
    const asset = markets.find((m) => m.name === p.coin), mid = mids[p.coin];
    if (!asset || !mid) return setErr("Market data not ready");
    setBusy(p.coin); setErr(null);
    const res = await closePosition(makeExchangeClient(walletClient), asset, Number(p.szi) * fraction, mid, fee.tenthsBps);
    if (!res.ok) { setBusy(null); return setErr(res.error ?? "Close failed"); }
    if (fraction === 1) {
      const mine = (feed?.posts ?? []).filter((i) => i.post.coin === p.coin && i.post.status === "open");
      await Promise.all(mine.map((i) => authedFetch(`/api/posts/${i.post.id}/close`, { method: "POST", body: JSON.stringify({ exitPx: res.avgPx ?? mid, reason: "manual" }) })));
    }
    setBusy(null); mutate(); mutateFeed();
  };

  return (
    <div className="fade-in profile">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold">{user.handle}</h1>
        {isMe ? <Link href="/settings" className="iconbtn" aria-label="Settings"><Icon d={I.gear} /></Link> : <span className="w-9" />}
      </header>
      <div className="pf-banner relative" style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : undefined}>
        {isMe && <Link href="/settings#profile" className="absolute right-4 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(0,0,0,.45)", color: "#fff" }}>Edit photo &amp; banner</Link>}
      </div>

      <section className="block">
        <div className="flex items-center gap-4">
          <div className="rounded-full" style={{ border: "4px solid var(--bg)" }}><Avatar handle={user.handle} url={user.avatarUrl} size={84} /></div>
          <div className="min-w-0 flex-1 pt-[46px]">
            <div className="text-[22px] font-extrabold tracking-tight">{user.handle}{user.verified && <span className="vbadge ml-1">✓</span>}<RankChip xp={user.xp} compact />{user.isDemo && <span className="lbl done ml-2" style={{ padding: "2px 8px", fontSize: 11 }}>Demo</span>}</div>
            <div className="mono when text-xs">{user.isDemo ? "practice account · simulated fills" : `${user.address.slice(0, 6)}…${user.address.slice(-4)} · verified on-chain`}</div>
            <div className="mt-2.5 flex gap-4 text-sm">
              <button className="muted" onClick={() => { setPeopleDir("followers"); setTab("people"); }}><b style={{ color: "var(--text)" }}>{data.followers}</b> followers</button>
              <button className="muted" onClick={() => { setPeopleDir("following"); setTab("people"); }}><b style={{ color: "var(--text)" }}>{data.following}</b> following</button>
            </div>
            {!isMe && viewer && (vsMe
              ? <Link href={`/rivalry/${viewer.handle}/${user.handle}`} className={`rival-chip mt-2 ${vsMe.mine > vsMe.theirs ? "lead" : ""}`} style={{ marginLeft: 0, fontSize: 12, padding: "3px 10px" }}>⚔ Your rival · {vsMe.mine > vsMe.theirs ? "you lead" : vsMe.mine < vsMe.theirs ? "they lead" : "all square"} {vsMe.mine}–{vsMe.theirs}</Link>
              : <button className="rival-chip mt-2" style={{ marginLeft: 0, fontSize: 12, padding: "3px 10px", border: 0 }} onClick={callOutRival}>⚔ Call out as your rival</button>)}
          </div>
        </div>
        {user.bio && <p className="mt-3.5">{user.bio}</p>}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {isMe ? <Link href="/compose" className="btn brand" style={{ padding: 12, fontSize: 14 }}>Write a post</Link> : <FollowButton handle={user.handle} />}
          {isMe ? <Link href="/settings" className="btn" style={{ padding: 12, fontSize: 14 }}>Edit profile</Link> : <button className="btn" style={{ padding: 12, fontSize: 14 }} onClick={() => (authenticated ? setChallenge(true) : login())}>⚔ Challenge</button>}
        </div>
      </section>

      {(pins.length > 0 || isMe) && (
        <section className="block pb-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{showingTop ? "Top trades" : "Pinned"}</span>
            <span className="flex items-center gap-2">
              {(data.battleStreak ?? 0) >= 2 && <span className="pin-streak">🔥 {data.battleStreak}-win streak</span>}
              {(s?.battlesWon ?? 0) + (s?.battlesLost ?? 0) > 0 && <span className="mono when"><span className="green">{s?.battlesWon ?? 0}W</span>–<span className="red">{s?.battlesLost ?? 0}L</span></span>}
            </span>
          </div>
          {isMe && showingTop && <div className="when mt-0.5 text-[11px]">Showing your best results. Pin your own picks from any trade or battle.</div>}
          <div className="hstrip mt-3" style={{ margin: "12px -20px 0", padding: "0 20px 6px" }}>
            {pins.map((p) => <PinCard key={p.post.id} item={p} roi={roiOf(p)} />)}
            {isMe && <button className="hcard grid place-items-center text-center" style={{ background: "transparent", border: "1px dashed var(--line)", minWidth: 120 }} onClick={() => { setTab("trades"); setTradeTab("closed"); }}><div><Icon d={I.plus} /><div className="when mt-1 text-[12px]">Pin a trade</div></div></button>}
          </div>
        </section>
      )}

      <RankCard xp={user.xp ?? 0} won={s?.battlesWon ?? 0} lost={s?.battlesLost ?? 0} recent={data.xpRecent ?? []} />

      {(theirRivals?.rivals.length ?? 0) > 0 && (
        <section className="block">
          <div className="flex items-center justify-between"><span className="eyebrow">Rivals</span><span className="when">{theirRivals!.rivals.length}</span></div>
          <div className="mt-2 flex flex-col">
            {theirRivals!.rivals.slice(0, 4).map((r) => (
              <Link key={r.handle} href={`/rivalry/${user.handle}/${r.handle}`} className="lb">
                <Avatar handle={r.handle} url={r.avatarUrl} size={40} link={false} />
                <div className="min-w-0 flex-1"><div className="name">{r.handle}<RankChip xp={r.xp} compact /></div><div className="when">{r.fights} fights{r.runHolderIsMe !== null && r.runLen >= 2 ? ` · ${r.runHolderIsMe ? user.handle : r.handle} on a ${r.runLen}-run` : ""}{r.calledByThem ? " · called them out" : ""}</div></div>
                <div className="text-right"><div className="mono text-[18px] font-bold"><span className={r.mine >= r.theirs ? "green" : "muted"}>{r.mine}</span><span className="muted">–</span><span className={r.theirs > r.mine ? "red" : "muted"}>{r.theirs}</span></div>{r.mine > r.theirs && <div className="when text-[10px]">👑 leads</div>}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isMe && user.isDemo && (
        <section className="block">
          <div className="flex items-center justify-between"><span className="eyebrow">Demo account</span><span className="when">live · practice USDC</span></div>
          <div className="mono mt-2 text-[36px] font-semibold tracking-tight">{fmtUsd(demoEq.equity)}</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="stat"><small>Available</small><div className="v mono">{fmtUsd(demoEq.cash)}</div></div>
            <div className="stat"><small>In trades</small><div className="v mono">{fmtUsd(demoEq.margin)}</div></div>
            <div className="stat"><small>Unrealised</small><div className={`v mono ${demoEq.upnl >= 0 ? "green" : "red"}`}>{fmtUsd(demoEq.upnl, { sign: true })}</div></div>
          </div>
          <p className="muted mt-2 text-[13px]">Simulated fills at live prices. When you&apos;re ready for real trades, turn demo off in Settings and deposit.</p>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5"><Link href="/settings" className="btn brand" style={{ padding: 12, fontSize: 14 }}>Go live</Link><button className="btn" style={{ padding: 12, fontSize: 14 }} onClick={async () => { await authedFetch("/api/me/settings", { method: "PATCH", body: JSON.stringify({ resetDemo: true }) }); mutate(); }}>Reset to $10,000</button></div>
        </section>
      )}
      {isMe && !user.isDemo && (
        <section className="block">
          <div className="flex items-center justify-between"><span className="eyebrow">Account balance</span><span className="when">USDC on Hyperliquid</span></div>
          <div className="mono mt-2 text-[36px] font-semibold tracking-tight">{fmtUsd(data.accountValue ?? 0)}</div>
          <div className="mt-2 flex gap-4 text-[13px]">
            <span className="muted">Available <b className="mono" style={{ color: "var(--text)" }}>{fmtUsd(data.withdrawable ?? 0)}</b></span>
            <span className="muted">In positions <b className="mono" style={{ color: "var(--text)" }}>{fmtUsd(data.positions.reduce((a, p) => a + Number(p.marginUsed), 0))}</b></span>
            <span className="muted">Open PnL <b className={`mono ${data.positions.reduce((a, p) => a + Number(p.unrealizedPnl), 0) >= 0 ? "green" : "red"}`}>{fmtUsd(data.positions.reduce((a, p) => a + Number(p.unrealizedPnl), 0), { sign: true })}</b></span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5"><button className="btn deposit" style={{ padding: 12, fontSize: 14 }} onClick={() => setSheet("deposit")}>Deposit</button><button className="btn withdraw" style={{ padding: 12, fontSize: 14 }} onClick={() => setSheet("withdraw")}>Withdraw</button></div>
        </section>
      )}

      <PerformanceCard handle={handle} stats={s} />

      <div className="tabs" style={{ gridTemplateColumns: "repeat(4, 1fr)", top: 0 }}>
        {(["activity", "trades", "posts", "people"] as Tab[]).map((t) => <button key={t} className={`capitalize ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "activity" && <ActivityFeed handle={handle} />}

      {tab === "posts" && (
        <>
          {(calls?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={mutateFeed} />)}
          {(feed?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} onChanged={mutateFeed} />)}
          {(feed?.posts.length ?? 0) + (calls?.posts.length ?? 0) === 0 && <p className="muted p-5 text-sm">No posts yet.</p>}
        </>
      )}

      {tab === "trades" && (
        <>
          <div className="seg px-5 pb-1 pt-3.5"><button className={`chip ${tradeTab === "open" ? "on" : ""}`} onClick={() => setTradeTab("open")}>Open · {user.isDemo ? (feed?.posts.length ?? 0) : data.positions.length}</button><button className={`chip ${tradeTab === "closed" ? "on" : ""}`} onClick={() => setTradeTab("closed")}>Closed · {s?.closedTrades ?? 0}</button></div>
          {tradeTab === "open" && user.isDemo && (feed?.posts ?? []).map((item) => (
            <div key={item.post.id} className="relative">
              <FeedPost item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={mutateFeed} />
            </div>
          ))}
          {tradeTab === "open" && !user.isDemo && data.positions.map((p) => {
            const szi = Number(p.szi), mid = mids[p.coin], upnl = Number(p.unrealizedPnl);
            return (
              <div key={p.coin} className="post">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><CoinMark coin={p.coin} /><div><div className="name">{ticker(p.coin, true)} <span className={`lbl ${szi > 0 ? "long" : "short"}`} style={{ padding: "2px 8px", fontSize: 11 }}><i />{szi > 0 ? "Long" : "Short"} {p.leverage.value}×</span></div><div className="mono when text-xs">{Math.abs(szi)} · in at {fmtPrice(p.entryPx)} · now {mid ? fmtPrice(mid) : "…"}{p.liquidationPx ? ` · liq ${fmtPrice(p.liquidationPx)}` : ""}</div></div></div>
                  <div className={`mono text-xl font-bold ${upnl >= 0 ? "green" : "red"}`}>{fmtUsd(upnl, { sign: true })}</div>
                </div>
                {isMe && <div className="mt-3.5 flex gap-2"><button className="chip danger" disabled={busy === p.coin} onClick={() => closePos(p, 0.5)}>Close 50%</button><button className="chip danger" disabled={busy === p.coin} onClick={() => closePos(p, 1)}>{busy === p.coin ? "Closing…" : "Close all"}</button><Link href={`/markets/${p.coin}`} className="chip info">Add</Link></div>}
              </div>
            );
          })}
          {tradeTab === "open" && (user.isDemo ? (feed?.posts.length ?? 0) === 0 : data.positions.length === 0) && <p className="muted p-5 text-sm">No open positions.</p>}
          {tradeTab === "closed" && (feed?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} full onChanged={() => { mutateFeed(); mutatePinned(); }} />)}
          {err && <p className="red px-5 text-sm">{err}</p>}
        </>
      )}

      {tab === "people" && (
        <>
          <div className="seg px-5 pb-1 pt-3.5">{(["followers", "following"] as People[]).map((d) => <button key={d} className={`chip capitalize ${people === d ? "on" : ""}`} onClick={() => setPeopleDir(d)}>{d} · {d === "followers" ? data.followers : data.following}</button>)}</div>
          {(peopleList?.users ?? []).map((u) => (
            <div key={u.handle} className="lb"><Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar handle={u.handle} url={u.avatarUrl} size={44} link={false} /><div className="min-w-0 flex-1"><div className="name">{u.handle}</div><div className="when">{fmtUsd(Number(u.pnl7d ?? 0), { sign: true, compact: true })} · 7 days · {fmtPct(Number(u.winRate ?? 0), 0)} win</div></div></Link><FollowButton handle={u.handle} compact /></div>
          ))}
          {(peopleList?.users.length ?? 0) === 0 && <p className="muted p-5 text-sm">Nobody here yet.</p>}
        </>
      )}

      {sheet && <DepositSheet initial={sheet} onClose={() => setSheet(null)} />}
      {challenge && <ChallengeSheet handle={user.handle} onClose={() => setChallenge(false)} />}
    </div>
  );
}

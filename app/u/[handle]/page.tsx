"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost } from "@/components/FeedPost";
import { DepositSheet } from "@/components/DepositSheet";
import { Avatar, CoinMark, Icon, I, ticker } from "@/components/ui";
import { useMids } from "@/lib/hooks/useMids";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { makeExchangeClient, closePosition } from "@/lib/hl-exchange";
import { fmtUsd, fmtPct, fmtPrice } from "@/lib/format";
import type { User, Stats } from "@/lib/schema";
import type { AssetPosition } from "@/lib/hl-info";
import type { FeedRow } from "@/lib/feed";

type ProfileRes = { user: User; stats: Stats | null; followers: number; following: number; rivalries: { opponent: string; wins: number; losses: number }[]; isFollowing: boolean; isMe: boolean; positions: AssetPosition[]; accountValue: number | null; withdrawable: number | null };
type Tab = "posts" | "trades" | "followers" | "following";

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { data, mutate } = useSWR<ProfileRes>(`/api/profile/${handle}`, { refreshInterval: 20_000 });
  const { authedFetch, walletClient, authenticated, login, fee } = useSession();
  const { mids } = useMids();
  const { markets } = useMarkets();
  const [tab, setTab] = useState<Tab>("posts");
  const [tradeTab, setTradeTab] = useState<"open" | "closed">("open");
  const [sheet, setSheet] = useState<"deposit" | "withdraw" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const postsKey = tab === "posts" ? `/api/posts?handle=${handle}&kind=text` : tab === "trades" ? `/api/posts?handle=${handle}&kind=trade&status=${tradeTab}` : null;
  const { data: feed, mutate: mutateFeed } = useSWR<{ posts: FeedRow[] }>(postsKey);
  const { data: calls } = useSWR<{ posts: FeedRow[] }>(tab === "posts" ? `/api/posts?handle=${handle}&kind=call&limit=10` : null);
  const { data: pinned } = useSWR<{ posts: FeedRow[] }>(`/api/posts?handle=${handle}&kind=trade&status=closed&limit=20`);
  const { data: people } = useSWR<{ users: { handle: string; avatarUrl: string | null; pnl7d: string | null; winRate: string | null }[] }>(tab === "followers" || tab === "following" ? `/api/follows?handle=${handle}&dir=${tab}` : null);

  if (!data) return <p className="muted p-5 text-sm">Loading…</p>;
  if ("error" in (data as unknown as Record<string, unknown>)) return <div className="p-5"><p className="muted">No trader with that handle.</p></div>;
  const { user, stats: s, isMe } = data;
  const pins = (pinned?.posts ?? []).filter((p) => p.post.pinned);
  const callHit = s && s.callsResolved ? (s.callsHit / s.callsResolved) * 100 : null;

  const follow = async () => {
    if (!authenticated) return login();
    await authedFetch("/api/follows", { method: "POST", body: JSON.stringify({ handle }) });
    mutate();
  };
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
  const pin = async (id: number) => { await authedFetch(`/api/posts/${id}/pin`, { method: "POST" }); mutateFeed(); };

  return (
    <div data-tint="violet" className="fade-in">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold">{user.handle}</h1>
        {isMe ? <Link href="/settings" className="iconbtn" aria-label="Settings"><Icon d={I.gear} /></Link> : <span className="w-9" />}
      </header>
      <div className="h-[92px] -mb-[46px]" style={{ background: "linear-gradient(135deg, var(--violet) 0%, #b893ff 60%, #ffd6e8 100%)" }} />

      <section className="block">
        <div className="flex items-center gap-4">
          <div className="rounded-full" style={{ border: "4px solid var(--bg)" }}><Avatar handle={user.handle} url={user.avatarUrl} size={84} /></div>
          <div className="min-w-0 flex-1 pt-[46px]">
            <div className="text-[22px] font-extrabold tracking-tight">{user.handle}{user.verified && <span className="vbadge ml-1">✓</span>}{user.isDemo && <span className="lbl done ml-2" style={{ padding: "2px 8px", fontSize: 11 }}>Demo</span>}</div>
            <div className="mono when text-xs">{user.isDemo ? "practice account · simulated fills" : `${user.address.slice(0, 6)}…${user.address.slice(-4)} · verified on-chain`}</div>
            <div className="mt-2.5 flex gap-4 text-sm">
              <button className="muted" onClick={() => setTab("followers")}><b style={{ color: "var(--text)" }}>{data.followers}</b> followers</button>
              <button className="muted" onClick={() => setTab("following")}><b style={{ color: "var(--text)" }}>{data.following}</b> following</button>
            </div>
          </div>
        </div>
        {user.bio && <p className="mt-3.5">{user.bio}</p>}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {isMe ? <Link href="/compose" className="btn brand" style={{ padding: 12, fontSize: 14 }}>Write a post</Link> : <button className={`btn ${data.isFollowing ? "" : "brand"}`} style={{ padding: 12, fontSize: 14 }} onClick={follow}>{data.isFollowing ? "Following" : "Follow"}</button>}
          {isMe ? <Link href="/settings" className="btn" style={{ padding: 12, fontSize: 14 }}>Edit profile</Link> : <Link href={`/compose?mode=call`} className="btn" style={{ padding: 12, fontSize: 14 }}>Challenge</Link>}
        </div>
      </section>

      {isMe && user.isDemo && (
        <section className="block">
          <div className="flex items-center justify-between"><span className="eyebrow">Demo balance</span><span className="when">practice USDC</span></div>
          <div className="mono mt-2 text-[36px] font-semibold tracking-tight">{fmtUsd(Number(user.demoBalance))}</div>
          <p className="muted mt-2 text-[13px]">Simulated fills at live prices. When you&apos;re ready for real trades, turn demo off in Settings and deposit.</p>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5"><Link href="/settings" className="btn brand" style={{ padding: 12, fontSize: 14 }}>Go live</Link><button className="btn" style={{ padding: 12, fontSize: 14 }} onClick={async () => { await authedFetch("/api/me/settings", { method: "PATCH", body: JSON.stringify({ resetDemo: true }) }); mutate(); }}>Reset to $1,000</button></div>
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

      <section className="block">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="stat"><small>7 day</small><div className={`v mono ${Number(s?.realizedPnl7d ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(Number(s?.realizedPnl7d ?? 0), { sign: true, compact: true })}</div></div>
          <div className="stat"><small>All time</small><div className={`v mono ${Number(s?.realizedPnlAll ?? 0) >= 0 ? "green" : "red"}`}>{fmtUsd(Number(s?.realizedPnlAll ?? 0), { sign: true, compact: true })}</div></div>
          <div className="stat"><small>Volume 30d</small><div className="v mono">{fmtUsd(Number(s?.volume30d ?? 0), { compact: true })}</div></div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <div className="stat"><small>Copied vs faded</small><div className="v mono">{s?.copiedCount ?? 0} <span className="muted text-xs">/</span> {s?.fadedCount ?? 0}</div></div>
          <div className="stat"><small>Rivalries</small><div className="v">{data.rivalries?.length ? `${data.rivalries[0].wins}–${data.rivalries[0].losses} ` : "—"}{data.rivalries?.length ? <span className="muted text-xs font-semibold">vs {data.rivalries[0].opponent}</span> : null}</div></div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <div className="stat"><small>Trades · {s?.closedTrades ?? 0} closed</small><div className="v mono">{fmtPct(Number(s?.winRate ?? 0), 0)} <span className="muted text-xs font-semibold">win</span></div></div>
          <div className="stat"><small>Calls · {s?.callsResolved ?? 0} resolved{s && Number(s.judgement) > 0 ? ` · Judgement ${Math.round(Number(s.judgement))}%` : ""}</small><div className="v mono">{callHit == null ? "—" : `${Math.round(callHit)}%`} <span className="muted text-xs font-semibold">hit</span>{(s?.callStreak ?? 0) > 1 && <span className="green ml-1 text-xs font-bold">🔥{s!.callStreak}</span>}</div></div>
        </div>
      </section>

      {(pins.length > 0 || isMe) && (
        <section className="block pb-3">
          <div className="flex items-center justify-between"><span className="eyebrow">Pinned trades</span>{isMe && <span className="when">closed trades only</span>}</div>
          <div className="hstrip mt-3" style={{ margin: "12px -20px 0", padding: "0 20px 6px" }}>
            {pins.map((p) => {
              const roi = ((Number(p.post.exitPx) - Number(p.post.entryPx)) / Number(p.post.entryPx)) * 100 * (p.post.side === "long" ? 1 : -1) * (p.post.leverage ?? 1);
              return (
                <Link key={p.post.id} href={`/post/${p.post.id}`} className="hcard violet">
                  <div className="when">{new Date(p.post.closedAt ?? p.post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-base font-extrabold tracking-tight">{p.post.coin} <span className={`lbl ${p.post.side}`} style={{ padding: "2px 8px", fontSize: 11 }}><i />{p.post.side === "long" ? "Long" : "Short"} {p.post.leverage}×</span></div>
                  <div className={`mono mt-1.5 text-[22px] font-bold ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 0)}</div>
                  <div className="mono when text-xs">{fmtUsd(Number(p.post.notionalUsd) / (p.post.leverage ?? 1), { compact: true })} margin</div>
                </Link>
              );
            })}
            {isMe && <button className="hcard grid place-items-center text-center" style={{ background: "transparent", border: "1px dashed var(--line)" }} onClick={() => { setTab("trades"); setTradeTab("closed"); }}><div><Icon d={I.plus} /><div className="when mt-1.5">Pin a trade</div></div></button>}
          </div>
        </section>
      )}

      <div className="tabs" style={{ gridTemplateColumns: "repeat(4, 1fr)", top: 0 }}>
        {(["posts", "trades", "followers", "following"] as Tab[]).map((t) => <button key={t} className={`capitalize ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "posts" && (
        <>
          {(calls?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={() => mutateFeed()} />)}
          {(feed?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} onChanged={() => mutateFeed()} />)}
          {(feed?.posts.length ?? 0) + (calls?.posts.length ?? 0) === 0 && <p className="muted p-5 text-sm">No posts yet.</p>}
        </>
      )}

      {tab === "trades" && (
        <>
          <div className="seg px-5 pb-1 pt-3.5"><button className={`chip ${tradeTab === "open" ? "on" : ""}`} onClick={() => setTradeTab("open")}>Open · {user.isDemo ? (feed?.posts.length ?? 0) : data.positions.length}</button><button className={`chip ${tradeTab === "closed" ? "on" : ""}`} onClick={() => setTradeTab("closed")}>Closed · {s?.closedTrades ?? 0}</button></div>
          {tradeTab === "open" && user.isDemo && (feed?.posts ?? []).map((item) => (
            <div key={item.post.id} className="relative">
              <FeedPost item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={() => mutateFeed()} />
              {isMe && <button className="chip danger absolute right-5 top-4" style={{ padding: "4px 10px", fontSize: 12 }} onClick={async () => { await authedFetch(`/api/posts/${item.post.id}/close`, { method: "POST", body: JSON.stringify({ exitPx: mids[item.post.coin!] ?? Number(item.post.entryPx), reason: "manual" }) }); mutate(); mutateFeed(); }}>Close</button>}
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
          {tradeTab === "closed" && (feed?.posts ?? []).map((item) => (
            <div key={item.post.id} className="relative">
              <FeedPost item={item} onChanged={() => mutateFeed()} />
              {isMe && <button className={`chip absolute right-5 top-4 ${item.post.pinned ? "on" : ""}`} style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => pin(item.post.id)}>{item.post.pinned ? "Pinned" : "Pin"}</button>}
            </div>
          ))}
          {err && <p className="red px-5 text-sm">{err}</p>}
        </>
      )}

      {(tab === "followers" || tab === "following") && (
        <>
          {(people?.users ?? []).map((u) => (
            <Link key={u.handle} href={`/u/${u.handle}`} className="lb"><Avatar handle={u.handle} url={u.avatarUrl} size={44} /><div className="min-w-0 flex-1"><div className="name">{u.handle}</div><div className="when">{fmtUsd(Number(u.pnl7d ?? 0), { sign: true, compact: true })} · 7 days · {fmtPct(Number(u.winRate ?? 0), 0)} win</div></div></Link>
          ))}
          {(people?.users.length ?? 0) === 0 && <p className="muted p-5 text-sm">Nobody here yet.</p>}
        </>
      )}

      {sheet && <DepositSheet initial={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

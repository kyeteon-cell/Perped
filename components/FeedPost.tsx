"use client";

import Link from "next/link";
import { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtPrice, fmtStake, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar, CoinMark, Icon, I, ticker, RankChip } from "./ui";
import { Sparkline } from "./Sparkline";
import { TradeChart } from "./TradeChart";
import { ShareSheet } from "./ShareSheet";
import { ManageTrade } from "./ManageTrade";
import { QuickTrade } from "./QuickTrade";
import { FollowButton } from "./FollowButton";
import { RichText } from "./RichText";
import { InlineComments } from "./InlineComments";
import { BattleSummary, battlesOf } from "./BattleSummary";
import { HL_NETWORK } from "@/lib/config";

/** Hyperliquid's own explorer page for an account: every fill, visible to anyone. */
export function explorerUrl(address?: string | null) {
  const base = HL_NETWORK === "mainnet" ? "https://app.hyperliquid.xyz/explorer" : "https://app.hyperliquid-testnet.xyz/explorer";
  return address ? `${base}/address/${address}` : base;
}

type Props = { item: FeedRow; mid?: number; onChanged?: () => void; compact?: boolean; full?: boolean };
export type BattleStamp = { battleId: number; faderPostId: number; vs?: string; won: boolean | null; myRoi: number; theirRoi: number; reason?: string };

// Dates arrive as ISO strings over JSON; normalise once.
const d = (x: Date | string | null | undefined) => (x ? new Date(x) : null);

/** One feed item. Dispatches on post.kind: trade, call, poll, text, system. */
export function FeedPost(props: Props) {
  const k = props.item.post.kind;
  if (k === "system") return <SystemPost {...props} />;
  if (k === "poll") return <PollPost {...props} />;
  if (k === "call") return <CallPost {...props} />;
  if (k === "text") return <TextPost {...props} />;
  return <TradePost {...props} />;
}

/* ---------- shared bits ---------- */

/** Small coloured label at the top of every card naming what kind of post it is. */
function KindTag({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div className="kind"><Icon d={icon} size={13} />{children}</div>;
}

/** True when a post is simulated: demo account or paper trade. */
export function isDemoPost(item: FeedRow) {
  return !!(item.author?.isDemo || item.post.paper);
}

function Who({ item, right }: { item: FeedRow; right?: React.ReactNode }) {
  const { post, author } = item;
  return (
    <div className="flex items-center gap-3">
      {author ? (
        <Link href={`/u/${author.handle}`} className="flex items-center gap-3">
          <Avatar handle={author.handle} url={author.avatarUrl} link={false} />
          <div>
            <div className="name">{author.handle}{author.verified && <span className="vbadge">✓</span>}<RankChip xp={author.xp} compact />{item.rival ? <span className={`rival-chip ${item.rival.mine > item.rival.theirs ? "lead" : ""}`}>⚔ {item.rival.mine}–{item.rival.theirs}</span> : null}{isDemoPost(item) ? <span className="demo-tag ml-1.5">Demo</span> : post.kind === "trade" ? <span className="real-tag ml-1.5">Real</span> : null}</div>
            <div className="when">{timeAgo(post.createdAt)} ago{post.kind === "trade" && (
              post.copiedFromId ? <> · copied {item.src ? <Link href={`/u/${item.src.handle}`} className="srcname" onClick={(e) => e.stopPropagation()}>@{item.src.handle}</Link> : "a trade"}</>
              : post.fadedFromId ? <> · faded {item.src ? <Link href={`/u/${item.src.handle}`} className="srcname" onClick={(e) => e.stopPropagation()}>@{item.src.handle}</Link> : "a trade"}</>
              : post.side === "short" ? " · sold" : " · bought"
            )}{post.kind === "trade" && post.status === "closed" ? " · closed" : ""}</div>
          </div>
        </Link>
      ) : null}
      {author && !author.isBot ? <FollowButton handle={author.handle} compact /> : null}
      <div className="ml-auto flex gap-1.5">{right}</div>
    </div>
  );
}

function Acts({ item, onChanged, children, mid, challenge, manage }: { item: FeedRow; onChanged?: () => void; children?: React.ReactNode; mid?: number; challenge?: boolean; manage?: boolean }) {
  const { authenticated, authedFetch, login } = useSession();
  const [share, setShare] = useState(false);
  const [managing, setManaging] = useState(false);
  const [likes, setLikes] = useState(item.likes);
  const [dislikes, setDislikes] = useState(item.dislikes);
  const [mine, setMine] = useState<number | null>(item.myVote ?? null);
  const [commenting, setCommenting] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentCount);
  const vote = async (value: 1 | -1) => {
    if (!authenticated) return login();
    // Optimistic: flip instantly, reconcile with the server, revert on failure.
    const before = { likes, dislikes, mine };
    const next: number | null = mine === value ? null : value;
    setLikes(likes + (next === 1 ? 1 : 0) - (mine === 1 ? 1 : 0));
    setDislikes(dislikes + (next === -1 ? 1 : 0) - (mine === -1 ? 1 : 0));
    setMine(next);
    try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(6); } catch {}
    const r = await authedFetch(`/api/posts/${item.post.id}/vote`, { method: "POST", body: JSON.stringify({ value }) });
    if (!r.ok) { setLikes(before.likes); setDislikes(before.dislikes); setMine(before.mine); return; }
    const j = await r.json();
    if (j.myVote !== next) { setMine(j.myVote); }
    onChanged?.();
  };
  return (
    <div className="acts">
      <button className={`vote up ${mine === 1 ? "on" : ""}`} onClick={() => vote(1)}><Icon d={I.like} size={18} /><b>{likes}</b></button>
      <button className={`vote down ${mine === -1 ? "on" : ""}`} onClick={() => vote(-1)}><Icon d={I.dislike} size={18} /><b>{dislikes}</b></button>
      <button className={commenting ? "on" : ""} onClick={() => setCommenting((v) => !v)} aria-label="Comment"><Icon d={I.comment} size={18} />{commentCount}</button>
      <button onClick={() => setShare(true)} aria-label="Share"><Icon d={I.share} size={18} /></button>
      {children}
      {manage && <PinButton item={item} />}
      {manage && <button className="fade ml-auto" onClick={() => setManaging(true)}>Manage</button>}
      {challenge && <button className={manage ? "copy" : "copy ml-auto"} onClick={() => setShare(true)}>Challenge</button>}
      {share && <ShareSheet item={item} mid={mid} onClose={() => setShare(false)} />}
      {managing && <ManageTrade post={item.post} mid={mid} onChanged={onChanged} onClose={() => setManaging(false)} />}
      {commenting && <InlineComments postId={item.post.id} onCount={setCommentCount} />}
    </div>
  );
}

/* ---------- swipe to copy / fade ---------- */

/**
 * Horizontal swipe on a live trade card: drag right to copy, left to fade. The card slides over a
 * coloured backdrop that labels the action; past the threshold it commits (with a haptic tick where
 * supported). Vertical movement hands control back to the scroller.
 */
function useSwipeToAct(onCopy: () => void, onFade: () => void, enabled: boolean, allowFade = true, allowCopy = true) {
  // Movement is written straight to the DOM (no React state per touch), so the card tracks the finger without lag.
  const [armed, setArmed] = useState<"copy" | "fade" | null>(null);
  const armedRef = useRef<"copy" | "fade" | null>(null);
  const fg = useRef<HTMLDivElement>(null);
  const bgCopy = useRef<HTMLSpanElement>(null);
  const bgFade = useRef<HTMLSpanElement>(null);
  const start = useRef<{ x: number; y: number; locked: null | "h" | "v" } | null>(null);
  const THRESH = 72, MAX = 110;
  const paint = (dx: number, animate: boolean) => {
    const el = fg.current; if (!el) return;
    el.style.transition = animate ? "transform .22s cubic-bezier(.2,.8,.2,1)" : "none";
    el.style.transform = dx ? `translate3d(${dx}px,0,0)` : "";
    if (bgCopy.current) bgCopy.current.style.opacity = String(Math.min(1, Math.max(0, dx / 48)));
    if (bgFade.current) bgFade.current.style.opacity = String(Math.min(1, Math.max(0, -dx / 48)));
  };
  const onTouchStart = (e: React.TouchEvent) => { if (!enabled) return; const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, locked: null }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const s0 = start.current; if (!s0) return;
    const t = e.touches[0]; const mx = t.clientX - s0.x, my = t.clientY - s0.y;
    if (!s0.locked) { if (Math.abs(mx) < 10 && Math.abs(my) < 10) return; s0.locked = Math.abs(mx) > Math.abs(my) * 1.3 ? "h" : "v"; }
    if (s0.locked === "v") return;
    // Rubber-band past the threshold so the card never flies off.
    const abs = Math.abs(mx), eased = abs <= THRESH ? abs : THRESH + (abs - THRESH) * 0.35;
    let dx = Math.sign(mx) * Math.min(MAX, eased);
    if ((dx < 0 && !allowFade) || (dx > 0 && !allowCopy)) dx = Math.sign(dx) * Math.min(Math.abs(dx), 14); // a little give, no action
    paint(dx, false);
    const next = dx > THRESH - 4 && allowCopy ? "copy" : dx < -(THRESH - 4) && allowFade ? "fade" : null;
    if (next !== armedRef.current) { armedRef.current = next; setArmed(next); if (next && typeof navigator !== "undefined" && "vibrate" in navigator) try { navigator.vibrate(10); } catch {} }
  };
  const onTouchEnd = () => {
    if (!start.current) return;
    const a = armedRef.current; start.current = null; armedRef.current = null; setArmed(null); paint(0, true);
    if (a === "copy") onCopy(); else if (a === "fade") onFade();
  };
  return { armed, refs: { fg, bgCopy, bgFade }, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

/** Pin / unpin one of your own trades (live or closed) to the top of your profile. */
function PinButton({ item }: { item: FeedRow }) {
  const { authedFetch, profile } = useSession();
  const { mutate } = useSWRConfig();
  const [on, setOn] = useState(!!item.post.pinned);
  const [busy, setBusy] = useState(false);
  if (!profile || item.author?.id !== profile.id || item.post.kind !== "trade") return null;
  const toggle = async () => {
    setBusy(true); setOn((v) => !v);
    const r = await authedFetch(`/api/posts/${item.post.id}/pin`, { method: "POST" });
    if (!r.ok) setOn((v) => !v); else { const j = await r.json(); setOn(!!j.pinned); }
    mutate((k) => typeof k === "string" && k.startsWith("/api/posts?handle="), undefined, { revalidate: true });
    setBusy(false);
  };
  return <button className={`pinbtn ${on ? "on" : ""}`} disabled={busy} onClick={toggle} aria-pressed={on}>{on ? "📌 Pinned" : "Pin to profile"}</button>;
}

/** Closed trade, full size: the result, the numbers, the battle verdict if it was one, and pin / share. */
function ClosedTradeCard({ item, onChanged }: Props) {
  const { post, author } = item;
  const entry = Number(post.entryPx), exit = Number(post.exitPx ?? entry), size = Number(post.size), lev = post.leverage ?? 1;
  const { pnl, pct } = pnlForPosition(post.side!, entry, exit, size);
  const roi = pct * lev, win = pnl >= 0;
  const margin = Number(post.notionalUsd) / lev;
  const held = post.closedAt ? Math.max(1, Math.round((new Date(post.closedAt).getTime() - new Date(post.createdAt).getTime()) / 60_000)) : 0;
  const heldTxt = held >= 1440 ? `${Math.round(held / 1440)}d` : held >= 60 ? `${Math.round(held / 60)}h` : `${held}m`;
  const reason = (post.meta as { closeReason?: string } | null)?.closeReason;
  return (
    <article className={`post ${win ? "tint-green" : "tint-red"} ${isDemoPost(item) ? "demo" : ""}`}>
      <KindTag icon={I.check}>{reason === "liquidation" ? "Liquidated" : reason === "tp" ? "Take profit hit" : reason === "sl" ? "Stop loss hit" : "Closed trade"}</KindTag>
      <Who item={item} right={<span className={`lbl ${post.side}`}><i />{post.side === "long" ? "Long" : "Short"} {lev}×</span>} />
      <div className="trow">
        <div className="flex min-w-0 items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <Link href={`/markets/${post.coin}`} className="coin">{ticker(post.coin!, true)}</Link>
            <div className="mono when mt-2">{fmtStake(margin)} × {lev} · {fmtPrice(entry)} → {fmtPrice(exit)} · held {heldTxt}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`pnl mono ${win ? "green" : "red"}`}>{fmtPct(roi, 1)}</div>
          <div className={`mono text-[13px] ${win ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })} banked</div>
        </div>
      </div>
      {battlesOf(post.meta).length > 0 && <div className="mt-3"><BattleSummary battles={battlesOf(post.meta)} /></div>}
      <div className="mt-2 flex items-center justify-between">
        {isDemoPost(item) ? <Link href="/how-it-works#demo" className="verify">Demo · simulated at live Hyperliquid prices</Link> : <a href={explorerUrl(author?.address)} target="_blank" rel="noreferrer" className="verify real"><Icon d={I.shield} size={12} />Verified on Hyperliquid ↗</a>}
        <span className="when">{item.copyCount} copied · {item.fadeCount} faded</span>
      </div>
      {post.body && <RichText text={post.body} />}
      <Acts item={item} onChanged={onChanged}>
        <span className="ml-auto" /><PinButton item={item} />
      </Acts>
    </article>
  );
}

/* ---------- trade ---------- */

function TradePost({ item, mid, onChanged, full }: Props) {
  const { post, author } = item;
  const { profile } = useSession();
  const router = useRouter();
  const entry = Number(post.entryPx), size = Number(post.size), lev = post.leverage ?? 1;
  const isOpen = post.status === "open";
  const mark = isOpen ? (mid ?? entry) : Number(post.exitPx ?? entry);
  const { pnl, pct } = pnlForPosition(post.side!, entry, mark, size);
  const roi = pct * lev, pos = pnl >= 0;
  const [mode, setMode] = useState<0 | 1 | 2>(profile?.pnlDisplay === "usd" ? 1 : profile?.pnlDisplay === "roi" ? 2 : 0);
  const pillRef = useRef<HTMLDivElement>(null);
  const prev = useRef(mark);
  useEffect(() => {
    if (!isOpen || prev.current === mark) return;
    const el = pillRef.current;
    if (el) { el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(mark > prev.current ? "flash-up" : "flash-down"); }
    prev.current = mark;
  }, [mark, isOpen]);

  const labels = [[fmtPct(pct, 1), fmtUsd(pnl, { sign: true })], [fmtUsd(pnl, { sign: true }), fmtPct(pct, 1)], [`${fmtPct(roi, 1)} ROI`, `${fmtUsd(pnl, { sign: true })} on ${fmtStake(Number(post.notionalUsd) / lev)}`]][mode];
  const showSize = author?.showSizes !== false;
  const camps = item.copyCount + item.fadeCount;
  const canAct = isOpen && !!author && author.id !== profile?.id;
  const [quick, setQuick] = useState<"copy" | "fade" | null>(null);
  const canFade = author?.allowFade !== false && !item.noFade;
  const canCopy = author?.allowCopy !== false;
  const swipe = useSwipeToAct(() => setQuick("copy"), () => setQuick("fade"), canAct, canFade, canCopy);

  if (!isOpen && full) return <ClosedTradeCard item={item} mid={mid} onChanged={onChanged} />;
  if (!isOpen) {
    // Closed trade: one compact row. The feed is about what's live; banked results are a footnote.
    return (
      <article className={`post row ${isDemoPost(item) ? "demo" : ""}`} onClick={() => router.push(`/post/${post.id}`)} role="link">
        {author ? <Link href={`/u/${author.handle}`}><Avatar handle={author.handle} url={author.avatarUrl} size={34} link={false} /></Link> : <span />}
        <CoinMark coin={post.coin!} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]"><b>{author?.handle}</b> <span className="muted">closed</span> <b>{ticker(post.coin!)}</b> <span className={post.side === "long" ? "green" : "red"}>{post.side}</span> <span className="muted">{lev}×</span>{isDemoPost(item) ? <span className="demo-tag ml-1.5">Demo</span> : <span className="real-tag ml-1.5">Real</span>}</div>
          <div className="mono when text-[12px]">{fmtPrice(entry)} → {fmtPrice(mark)} · {timeAgo(post.closedAt ?? post.createdAt)} ago{camps ? ` · ${item.copyCount} copied, ${item.fadeCount} faded` : ""}</div>
        </div>
        <Link href={`/post/${post.id}`} className="text-right">
          <div className={`pnl mono ${pos ? "green" : "red"}`}>{fmtPct(roi, 1)}</div>
          <div className={`mono text-[12px] ${pos ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</div>
        </Link>
      </article>
    );
  }

  return (
    <article className={`post swipe tcard ${post.fadedFromId ? "battlecard" : ""} ${swipe.armed ?? ""} ${isDemoPost(item) ? "demo" : ""}`} {...(canAct ? swipe.handlers : {})}>
      <div className="swipe-bg" aria-hidden>
        <span ref={swipe.refs.bgCopy} className="sb sb-copy"><Icon d={I.copy} size={18} />Copy</span>
        <span ref={swipe.refs.bgFade} className="sb sb-fade">Fade<Icon d={I.bolt} size={18} /></span>
      </div>
      {quick && <QuickTrade item={item} mode={quick} onClose={() => setQuick(null)} />}
      <div ref={swipe.refs.fg} className="swipe-fg">
      {post.fadedFromId && <BattleHead item={item} mark={mark} myRoi={roi} />}
      <Who item={item} right={<span className={`lbl ${post.side}`}><i />{post.side === "long" ? "Long" : "Short"} {lev}×</span>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <Link href={`/markets/${post.coin}`} className="coin">{ticker(post.coin!, true)}</Link>
            <div className="mono when tsub">
              {showSize ? `${fmtStake(Number(post.notionalUsd) / lev)} × ${lev} · ` : ""}in {fmtPrice(entry)}
            </div>
          </div>
        </div>
        <div ref={pillRef} className={`pnlpill ${pos ? "g" : "r"}`} onClick={() => setMode(((mode + 1) % 3) as 0 | 1 | 2)} title="Tap to switch % / $ / ROI">
          <div className={`pnl mono ${pos ? "green" : "red"}`}>{labels[0]}</div>
          <div className={`mono text-[13px] ${pos ? "green" : "red"}`}>{labels[1]}</div>
        </div>
      </div>
      <TradeChart coin={post.coin!} entry={entry} mark={mark} side={post.side as "long" | "short"} lev={lev} openedAt={post.createdAt} tp={post.tpPx ? Number(post.tpPx) : null} sl={post.slPx ? Number(post.slPx) : null} />
      <div className="tfoot">
        {isDemoPost(item)
          ? <Link href="/how-it-works#demo" className="verify">Demo · live prices</Link>
          : <a href={explorerUrl(author?.address)} target="_blank" rel="noreferrer" className="verify real"><Icon d={I.shield} size={12} />Verified ↗</a>}
        {(post.tpPx || post.slPx) && <span className="mono">{post.tpPx ? `TP ${fmtPrice(post.tpPx)}` : ""}{post.tpPx && post.slPx ? " · " : ""}{post.slPx ? `SL ${fmtPrice(post.slPx)}` : ""}</span>}
        {camps > 0 && <span><b>{item.copyCount}</b> copied · <b>{item.fadeCount}</b> faded</span>}
      </div>
      {post.body && <RichText text={post.body} />}
      <Acts item={item} onChanged={onChanged} mid={mid} challenge={isOpen && !!author && author.id === profile?.id} manage={isOpen && !!author && author.id === profile?.id}>
        {canAct && (
          <>
            {canFade ? <button className="fade ml-auto" onClick={() => setQuick("fade")}>Fade</button> : item.noFade ? <span className="when ml-auto text-[11px]">already in a battle</span> : null}
            {canCopy && <button className={canFade || item.noFade ? "copy" : "copy ml-auto"} onClick={() => setQuick("copy")}>Copy</button>}
          </>
        )}
      </Acts>
      </div>
    </article>
  );
}

/* ---------- battle header (fades) ---------- */

/** Faceoff strip on a fade: the original trader vs the fader, live ROI each, who's ahead, tap to watch. */
function BattleHead({ item, mark, myRoi }: { item: FeedRow; mark: number; myRoi: number }) {
  const { post, author, src } = item;
  if (!src || !author) return <Link href={`/battle/${post.id}`} className="kind battle-link"><Icon d={I.bolt} size={13} />Battle · watch →</Link>;
  const entry = Number(src.entryPx ?? 0), lev = src.leverage ?? 1;
  const theirMark = src.status === "open" ? mark : Number(src.exitPx ?? entry);
  const theirRoi = entry && src.side ? pnlForPosition(src.side, entry, theirMark, Number(src.size ?? 0)).pct * lev : 0;
  const meAhead = myRoi > theirRoi, even = Math.abs(myRoi - theirRoi) < 0.05;
  const share = Math.max(10, Math.min(90, 50 + ((theirRoi - myRoi) / (Math.abs(theirRoi) + Math.abs(myRoi) || 1)) * 50));
  return (
    <Link href={`/battle/${post.id}`} className="bhead" onClick={(e) => e.stopPropagation()}>
      <div className="bh-top"><span className="bh-tag"><Icon d={I.bolt} size={12} />Battle</span><span className="bh-watch">{even ? "Dead level" : `${meAhead ? author.handle : src.handle} ahead`} · watch →</span></div>
      <div className="bh-row">
        <div className={`bh-f ${!meAhead && !even ? "lead" : ""}`}>
          <span className={`bh-av ${src.side ?? "long"}`}><Avatar handle={src.handle} url={src.avatarUrl} size={30} link={false} /></span>
          <div className="min-w-0"><div className="bh-name"><span className="truncate">{src.handle}</span><RankChip xp={src.xp} compact size={16} /></div><div className={`mono bh-roi ${theirRoi >= 0 ? "green" : "red"}`}>{fmtPct(theirRoi, 1)}</div></div>
        </div>
        <span className="bh-vs">VS</span>
        <div className={`bh-f r ${meAhead && !even ? "lead" : ""}`}>
          <div className="min-w-0 text-right"><div className="bh-name r"><RankChip xp={author.xp} compact size={16} /><span className="truncate">{author.handle}</span></div><div className={`mono bh-roi ${myRoi >= 0 ? "green" : "red"}`}>{fmtPct(myRoi, 1)}</div></div>
          <span className={`bh-av ${post.side ?? "short"}`}><Avatar handle={author.handle} url={author.avatarUrl} size={30} link={false} /></span>
        </div>
      </div>
      <div className="bh-tug" style={{ background: post.side === "long" ? "var(--green)" : "var(--red)" }}><i style={{ width: `${share}%`, background: src.side === "short" ? "var(--red)" : "var(--green)" }} /></div>
    </Link>
  );
}

/* ---------- call ---------- */

function CallPost({ item, mid, onChanged }: Props) {
  const { post } = item;
  const { profile } = useSession();
  const target = Number(post.targetPx), p = mid ?? target;
  const up = post.side === "long";
  const open = post.callStatus === "open";
  const meta = post.meta as { fromPx?: number; quick?: boolean } | null;
  const fromPx = Number(meta?.fromPx ?? 0);
  const quick = meta?.quick === true;
  const pctToTarget = fromPx ? ((target - fromPx) / fromPx) * 100 : 0;
  const liveMove = fromPx ? ((p - fromPx) / fromPx) * 100 * (up ? 1 : -1) : 0; // quick calls: how far in your favour right now
  const progress = quick ? Math.max(0, Math.min(100, 50 + liveMove * 25)) : fromPx && target !== fromPx ? Math.max(0, Math.min(100, ((p - fromPx) / (target - fromPx)) * 100)) : 0;
  const deadline = d(post.deadline), resolvedAt = d(post.resolvedAt);
  const left = deadline ? Math.max(0, deadline.getTime() - Date.now()) : 0;
  const leftTxt = left > 86_400_000 ? `${Math.round(left / 86_400_000)} d left` : left > 3_600_000 ? `${Math.round(left / 3_600_000)} h left` : left > 0 ? `${Math.max(1, Math.round(left / 60_000))} m left` : "";
  return (
    <article className={`post ${open ? "tint-blue" : post.callStatus === "hit" ? "tint-green" : "tint-red"}`}>
      <KindTag icon={I.trophy}>{quick ? (open ? "One-hour call" : post.callStatus === "hit" ? "Called it" : "Got perped") : open ? "Price call" : post.callStatus === "hit" ? "Call hit" : "Call missed"}</KindTag>
      <Who item={item} right={<>{post.backedPostId && <span className="lbl backed">Backed</span>}<span className={`lbl ${open ? "call" : post.callStatus === "hit" ? "long" : "short"}`}><i />{open ? "Call" : post.callStatus === "hit" ? "Hit" : "Missed"}</span></>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <div className="coin" style={{ fontSize: 24 }}>{ticker(post.coin!, true)} <span className="muted text-sm font-semibold tracking-normal">{quick ? (up ? "higher" : "lower") : `${up ? "↑" : "↓"} ${fmtPrice(target)}`}</span></div>
            <div className="mono when mt-2">{quick ? `from ${fmtPrice(fromPx || target)}${deadline ? ` · settles ${deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}` : `${fromPx ? `from ${fmtPrice(fromPx)} · ${fmtPct(pctToTarget, 1)}` : up ? "up" : "down"}${deadline ? ` · by ${deadline.toLocaleDateString("en-US", { weekday: "short" })}` : ""}${post.invalidPx ? ` · invalid ${up ? "below" : "above"} ${fmtPrice(post.invalidPx)}` : ""}`}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`pnl mono ${quick && open ? (liveMove >= 0 ? "green" : "red") : ""}`} style={{ fontSize: 22 }}>{open ? (quick ? fmtPct(liveMove, 2) : `${Math.round(progress)}%`) : fmtPrice(post.resolvedPx)}</div>
          <div className="when">{open ? (quick ? `${liveMove >= 0 ? "winning" : "losing"} · ${leftTxt}` : `to target · ${leftTxt}`) : `resolved ${resolvedAt ? timeAgo(resolvedAt) + " ago" : ""}`}</div>
        </div>
      </div>
      <div className="track"><b style={{ width: `${open ? progress : 100}%`, background: open ? "var(--text)" : post.callStatus === "hit" ? "var(--green)" : "var(--red)" }} /></div>
      {post.body && !quick && <RichText text={post.body} />}
      <Acts item={item} onChanged={onChanged} challenge={open && !!item.author && item.author.id === profile?.id}>
        {open && item.author?.id !== profile?.id && <Link href={`/trade?coin=${post.coin}&side=${post.side}`} className="copy ml-auto">Trade it</Link>}
      </Acts>
    </article>
  );
}

/* ---------- poll ---------- */

function PollPost({ item, onChanged }: Props) {
  const { post } = item;
  const { authenticated, authedFetch, login } = useSession();
  const [counts, setCounts] = useState<number[]>(() => (post.options ?? []).map((_, i) => item.pollCounts?.[i] ?? 0));
  const [mine, setMine] = useState<number | null>(item.myPollVote ?? null);
  const total = counts.reduce((a, b) => a + b, 0);
  const closesAt = d(post.closesAt);
  const closed = post.status === "closed" || (closesAt && closesAt.getTime() < Date.now());
  const vote = async (i: number) => {
    if (closed) return;
    if (!authenticated) return login();
    const r = await authedFetch(`/api/posts/${post.id}/poll`, { method: "POST", body: JSON.stringify({ option: i }) });
    if (!r.ok) return;
    setCounts((c) => c.map((n, j) => n + (j === i ? 1 : 0) - (j === mine ? 1 : 0)));
    setMine(i);
    onChanged?.();
  };
  return (
    <article className="post tint-violet">
      <KindTag icon={I.list}>Poll{closed ? " · closed" : ""}</KindTag>
      <Who item={item} right={<span className="lbl done">{post.settle ? "Settles on price" : `${total} votes`}</span>} />
      <p className="say font-bold">{post.body}</p>
      <div className="poll mt-3 flex flex-col gap-2">
        {(post.options ?? []).map((o, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          const winner = post.settle?.winner === i;
          return (
            <button key={i} className={`opt ${mine === i ? "on" : ""}`} onClick={() => vote(i)} disabled={!!closed}>
              <i style={{ width: `${pct}%` }} /><span>{o}{winner ? " ✓" : ""}</span><b className="mono">{pct}%</b>
            </button>
          );
        })}
      </div>
      <div className="when mt-2.5">{total} votes{closesAt ? ` · ${closed ? "closed" : "closes"} ${closesAt.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</div>
      <Acts item={item} onChanged={onChanged} />
    </article>
  );
}

/* ---------- text ---------- */

function TextPost({ item, onChanged }: Props) {
  return (
    <article className="post bare">
      <Who item={item} />
      <RichText text={item.post.body ?? ""} />
      <Acts item={item} onChanged={onChanged} />
    </article>
  );
}

/* ---------- system (liquidation, milestone, settled, duel_settled, story) ---------- */

function SystemPost({ item, onChanged }: Props) {
  const { post } = item;
  const t = post.systemType ?? "";
  const meta = (post.meta ?? {}) as Record<string, unknown>;

  if (t === "duel_settled") {
    const winner = String(meta.winner ?? "?"), loser = String(meta.loser ?? "?");
    return (
      <article className="post duel">
        <div className="duel-head"><span className="lbl gold">⚔ Duel settled</span><span className="when">{post.coin ?? ""} · {timeAgo(post.createdAt)} ago</span></div>
        <div className="duel-body">
          <div className="duelist"><Link href={`/u/${winner}`}><Avatar handle={winner} size={48} link={false} /></Link><div className="name mt-1.5">{winner}</div><span className="lbl long mt-1"><i />Won</span></div>
          <div className="duel-mid"><div className="mono muted text-xs">{post.coin}</div><div className="duel-bar"><i style={{ width: "100%" }} /></div><div className="when">{meta.start ? `${fmtPrice(Number(meta.start))} → ${fmtPrice(Number(meta.end))}` : "settled"}</div></div>
          <div className="duelist"><Link href={`/u/${loser}`}><Avatar handle={loser} size={48} link={false} /></Link><div className="name mt-1.5">{loser}</div><span className="lbl short mt-1"><i />Lost</span></div>
        </div>
        <Acts item={item} onChanged={onChanged}>
          <Link href={`/u/${winner}`} className="chip ml-auto">Challenge {winner}</Link>
        </Acts>
      </article>
    );
  }

  if (t === "battle_settled") {
    const winner = String(meta.winner ?? "?"), loser = String(meta.loser ?? "?");
    const wr = Number(meta.winnerRoi ?? 0), lr = Number(meta.loserRoi ?? 0);
    return (
      <article className="post duel">
        <div className="duel-head"><span className="lbl gold">⚡ Battle settled</span><span className="when">{post.coin ?? ""} · {timeAgo(post.createdAt)} ago</span></div>
        <div className="duel-body">
          <div className="duelist"><Link href={`/u/${winner}`}><Avatar handle={winner} size={48} link={false} /></Link><div className="name mt-1.5">{winner}</div><span className="mono green text-[13px] font-bold">{fmtPct(wr, 1)}</span></div>
          <div className="duel-mid"><div className="mono muted text-xs">perped</div><div className="duel-bar"><i style={{ width: "100%" }} /></div><div className="when">{meta.reason === "liquidation" ? "by liquidation" : `${fmtPct(Math.abs(wr - lr), 1)} gap`}</div></div>
          <div className="duelist"><Link href={`/u/${loser}`}><Avatar handle={loser} size={48} link={false} /></Link><div className="name mt-1.5">{loser}</div><span className="mono red text-[13px] font-bold">{fmtPct(lr, 1)}</span></div>
        </div>
        <Acts item={item} onChanged={onChanged}>
          {typeof meta.faderPostId === "number" && <Link href={`/battle/${meta.faderPostId}`} className="chip ml-auto">See the battle</Link>}
        </Acts>
      </article>
    );
  }

  if (t === "rivalry") {
    const w = String(meta.winner ?? "?"), l = String(meta.loser ?? "?");
    const label = meta.kind === "sweep" ? "Sweep" : meta.kind === "streak_end" ? "Run ended" : "Lead change";
    return (
      <article className="post duel">
        <div className="duel-head"><span className="lbl gold">⚔ Rivalry · {label}</span><span className="when">{timeAgo(post.createdAt)} ago</span></div>
        <div className="duel-body">
          <div className="duelist"><Avatar handle={w} size={48} /><div className="name mt-1.5">{w}</div></div>
          <div className="duel-mid"><div className="mono text-[22px] font-bold">{String(meta.score ?? "")}</div><div className="when">{post.body}</div></div>
          <div className="duelist"><Avatar handle={l} size={48} /><div className="name mt-1.5">{l}</div></div>
        </div>
        <Acts item={item} onChanged={onChanged}>
          {typeof meta.href === "string" && <Link href={meta.href} className="chip ml-auto">See the rivalry</Link>}
        </Acts>
      </article>
    );
  }

  if (t === "story" && post.coin) {
    return (
      <article className="post tint-brand story">
        <KindTag icon={I.markets}>Market</KindTag>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><CoinMark coin={post.coin} /><div><div className="name">{ticker(post.coin)} is moving</div><div className="when">{post.body}</div></div></div>
          <Link href={`/markets/${post.coin}`} className="chip">Trade</Link>
        </div>
        <div className="mt-3"><Sparkline coin={post.coin} up={!/down|dump|−|-\d/.test(post.body ?? "")} wide /></div>
      </article>
    );
  }

  const isLiq = t === "liquidation";
  const tint = isLiq ? "tint-red" : t === "settled" ? "tint-green" : t === "milestone" ? "tint-gold" : "tint-brand";
  const icon = isLiq ? I.bolt : t === "milestone" ? I.trophy : t === "settled" ? I.list : I.markets;
  const title = isLiq ? "Liquidation" : t === "milestone" ? "Milestone" : t === "settled" ? "Settled" : t === "rank" ? "Leaderboard" : "Perped";
  return (
    <article className={`post alert ${tint}`}>
      <div className="flex items-center gap-3">
        <div className="sysico" style={{ background: "var(--bg)", color: "inherit" }}><Icon d={icon} /></div>
        <div><div className="kind" style={{ margin: 0 }}>{title}</div><div className="when">{timeAgo(post.createdAt)} ago</div></div>
      </div>
      <p className="say">{post.body}</p>
      <Acts item={item} onChanged={onChanged}>
        {typeof meta.postId === "number" && <Link href={`/post/${meta.postId}?share=1`} className="chip ml-auto">Receipt</Link>}
        {isLiq && <span className="muted ml-auto text-xs">Size small. Stops exist.</span>}
      </Acts>
    </article>
  );
}

/** Horizontal strip of small cards for a run of milestone / rank posts, so they don't each take a full card. */
export function RankStrip({ items }: { items: FeedRow[] }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-5"><span className="eyebrow">Around Perped</span><span className="when">{timeAgo(items[0].post.createdAt)} ago</span></div>
      <div className="ranks">
        {items.map(({ post }) => {
          const t = post.systemType ?? "";
          const meta = (post.meta ?? {}) as Record<string, unknown>;
          return (
            <Link key={post.id} href={`/post/${post.id}`} className="rankcard">
              <div className="when">{t === "milestone" ? "Milestone" : t === "rank" ? "Leaderboard" : "Perped"}</div>
              <div className="name mt-1 line-clamp-2 text-[14px]">{typeof meta.handle === "string" ? `${meta.handle} ${t === "milestone" ? `hit ${((Number(meta.roi) || 0) / 100 + 1).toFixed(1)}×` : ""}` : post.body}</div>
              {typeof meta.handle === "string" && <div className="muted mt-1 line-clamp-2 text-[12px]">{post.body}</div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

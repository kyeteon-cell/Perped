"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { fmtUsd, fmtPct, pnlForPosition, timeAgo, fmtPrice } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar, CoinMark, Icon, I, ticker } from "./ui";
import { Sparkline } from "./Sparkline";

type Props = { item: FeedRow; mid?: number; onChanged?: () => void; compact?: boolean };

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

function Who({ item, right }: { item: FeedRow; right?: React.ReactNode }) {
  const { post, author } = item;
  return (
    <div className="flex items-center gap-3">
      {author ? (
        <Link href={`/u/${author.handle}`} className="flex items-center gap-3">
          <Avatar handle={author.handle} url={author.avatarUrl} />
          <div>
            <div className="name">{author.handle}{author.verified && <span className="vbadge">✓</span>}{(author.isDemo || post.paper) && <span className="lbl done ml-1.5" style={{ padding: "1px 7px", fontSize: 10 }}>Demo</span>}</div>
            <div className="when">{timeAgo(post.createdAt)} ago{post.copiedFromId ? " · copied" : ""}{post.fadedFromId ? " · faded" : ""}{post.kind === "trade" && post.status === "closed" ? " · closed" : ""}</div>
          </div>
        </Link>
      ) : null}
      <div className="ml-auto flex gap-1.5">{right}</div>
    </div>
  );
}

function Acts({ item, onChanged, children }: { item: FeedRow; onChanged?: () => void; children?: React.ReactNode }) {
  const { authenticated, authedFetch, login } = useSession();
  const [likes, setLikes] = useState(item.likes);
  const [dislikes, setDislikes] = useState(item.dislikes);
  const [mine, setMine] = useState<number | null>(item.myVote ?? null);
  const vote = async (value: 1 | -1) => {
    if (!authenticated) return login();
    const r = await authedFetch(`/api/posts/${item.post.id}/vote`, { method: "POST", body: JSON.stringify({ value }) });
    if (!r.ok) return;
    const j = await r.json();
    const next: number | null = j.myVote;
    setLikes((n) => n + (next === 1 ? 1 : 0) - (mine === 1 ? 1 : 0));
    setDislikes((n) => n + (next === -1 ? 1 : 0) - (mine === -1 ? 1 : 0));
    setMine(next);
    onChanged?.();
  };
  return (
    <div className="acts">
      <button className={`vote up ${mine === 1 ? "on" : ""}`} onClick={() => vote(1)}><Icon d={I.like} size={18} /><b>{likes}</b></button>
      <button className={`vote down ${mine === -1 ? "on" : ""}`} onClick={() => vote(-1)}><Icon d={I.dislike} size={18} /><b>{dislikes}</b></button>
      <Link href={`/post/${item.post.id}`}><Icon d={I.comment} size={18} />{item.commentCount}</Link>
      {children}
    </div>
  );
}

/* ---------- swipe to copy / fade ---------- */

/**
 * Horizontal swipe on a live trade card: drag right to copy, left to fade. The card slides over a
 * coloured backdrop that labels the action; past the threshold it commits (with a haptic tick where
 * supported). Vertical movement hands control back to the scroller.
 */
function useSwipeToAct(onCopy: () => void, onFade: () => void, enabled: boolean) {
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState<"copy" | "fade" | null>(null);
  const start = useRef<{ x: number; y: number; locked: null | "h" | "v" } | null>(null);
  const THRESH = 96, MAX = 150;
  const onTouchStart = (e: React.TouchEvent) => { if (!enabled) return; const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, locked: null }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const s0 = start.current; if (!s0) return;
    const t = e.touches[0]; const mx = t.clientX - s0.x, my = t.clientY - s0.y;
    if (!s0.locked) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; s0.locked = Math.abs(mx) > Math.abs(my) * 1.2 ? "h" : "v"; }
    if (s0.locked === "v") return;
    const clamped = Math.max(-MAX, Math.min(MAX, mx * 0.9));
    setDx(clamped);
    const next = clamped > THRESH ? "copy" : clamped < -THRESH ? "fade" : null;
    if (next !== armed) { setArmed(next); if (next && typeof navigator !== "undefined" && "vibrate" in navigator) try { navigator.vibrate(12); } catch {} }
  };
  const onTouchEnd = () => {
    if (!start.current) return;
    const a = armed; start.current = null; setDx(0); setArmed(null);
    if (a === "copy") onCopy(); else if (a === "fade") onFade();
  };
  return { dx, armed, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

/* ---------- trade ---------- */

function TradePost({ item, mid, onChanged }: Props) {
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

  const labels = [[fmtPct(pct, 1), fmtUsd(pnl, { sign: true })], [fmtUsd(pnl, { sign: true }), fmtPct(pct, 1)], [`${fmtPct(roi, 1)} ROI`, `${fmtUsd(pnl, { sign: true })} on ${fmtUsd(Number(post.notionalUsd) / lev, { compact: true })}`]][mode];
  const showSize = author?.showSizes !== false;
  const camps = item.copyCount + item.fadeCount;
  const canAct = isOpen && !!author && author.id !== profile?.id;
  const swipe = useSwipeToAct(() => router.push(`/trade?copy=${post.id}`), () => router.push(`/trade?fade=${post.id}`), canAct);

  if (!isOpen) {
    // Closed trade: one compact row. The feed is about what's live; banked results are a footnote.
    return (
      <article className="post row">
        {author ? <Link href={`/u/${author.handle}`}><Avatar handle={author.handle} url={author.avatarUrl} size={34} /></Link> : <span />}
        <CoinMark coin={post.coin!} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]"><b>{author?.handle}</b> <span className="muted">closed</span> <b>{ticker(post.coin!)}</b> <span className={post.side === "long" ? "green" : "red"}>{post.side}</span> <span className="muted">{lev}×</span>{(author?.isDemo || post.paper) && <span className="lbl done ml-1.5" style={{ padding: "1px 7px", fontSize: 10 }}>Demo</span>}</div>
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
    <article className={`post swipe ${swipe.armed ?? ""}`} {...(canAct ? swipe.handlers : {})}>
      <div className="swipe-bg" aria-hidden>
        <span className="sb-copy" style={{ opacity: Math.min(1, Math.max(0, swipe.dx / 60)) }}><Icon d={I.copy} size={20} /> Copy{swipe.armed === "copy" ? " ✓" : ""}</span>
        <span className="sb-fade" style={{ opacity: Math.min(1, Math.max(0, -swipe.dx / 60)) }}>{swipe.armed === "fade" ? "✓ " : ""}Fade <Icon d={I.bolt} size={20} /></span>
      </div>
      <div className="swipe-fg" style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined, transition: swipe.dx ? "none" : "transform .25s cubic-bezier(.2,.8,.2,1)" }}>
      <Who item={item} right={<span className={`lbl ${post.side}`}><i />{post.side === "long" ? "Long" : "Short"} {lev}×</span>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <Link href={`/markets/${post.coin}`} className="coin">{ticker(post.coin!, true)}</Link>
            <div className="mono when mt-2">
              {showSize ? `${fmtUsd(Number(post.notionalUsd), { compact: true })} · ` : ""}in at {fmtPrice(entry)}
            </div>
          </div>
        </div>
        <div ref={pillRef} className={`pnlpill ${pos ? "g" : "r"}`} onClick={() => setMode(((mode + 1) % 3) as 0 | 1 | 2)} title="Tap to switch % / $ / ROI">
          <div className={`pnl mono ${pos ? "green" : "red"}`}>{labels[0]}</div>
          <div className={`mono text-[13px] ${pos ? "green" : "red"}`}>{labels[1]}</div>
        </div>
      </div>
      <div className="track"><b style={{ width: `${Math.min(100, Math.abs(roi))}%`, background: pos ? "var(--green)" : "var(--red)" }} /></div>
      {camps >= 3 ? (
        <div className="camps"><span><b>{item.copyCount} copied</b></span><span className="faint text-[11px] font-extrabold">vs</span><span><b>{item.fadeCount} faded</b></span></div>
      ) : (
        <div className="camps"><span>Be the first to copy or fade this one</span></div>
      )}
      {post.body && <p className="say">{post.body}</p>}
      <Acts item={item} onChanged={onChanged}>
        {canAct && (
          <>
            <Link href={`/trade?fade=${post.id}`} className="fade ml-auto">Fade</Link>
            <Link href={`/trade?copy=${post.id}`} className="copy">Copy</Link>
          </>
        )}
      </Acts>
      </div>
    </article>
  );
}

/* ---------- call ---------- */

function CallPost({ item, mid, onChanged }: Props) {
  const { post } = item;
  const target = Number(post.targetPx), p = mid ?? target;
  const up = post.side === "long";
  const open = post.callStatus === "open";
  const fromPx = Number((post.meta as { fromPx?: number } | null)?.fromPx ?? 0);
  const pctToTarget = fromPx ? ((target - fromPx) / fromPx) * 100 : 0;
  const progress = fromPx ? Math.max(0, Math.min(100, ((p - fromPx) / (target - fromPx)) * 100)) : 0;
  const deadline = d(post.deadline), resolvedAt = d(post.resolvedAt);
  const left = deadline ? Math.max(0, deadline.getTime() - Date.now()) : 0;
  const leftTxt = left > 86_400_000 ? `${Math.round(left / 86_400_000)} d left` : left > 0 ? `${Math.round(left / 3_600_000)} h left` : "";
  return (
    <article className={`post ${open ? "tint-blue" : post.callStatus === "hit" ? "tint-green" : "tint-red"}`}>
      <KindTag icon={I.trophy}>{open ? "Price call" : post.callStatus === "hit" ? "Call hit" : "Call missed"}</KindTag>
      <Who item={item} right={<>{post.backedPostId && <span className="lbl backed">Backed</span>}<span className={`lbl ${open ? "call" : post.callStatus === "hit" ? "long" : "short"}`}><i />{open ? "Call" : post.callStatus === "hit" ? "Hit" : "Missed"}</span></>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <div className="coin" style={{ fontSize: 24 }}>{ticker(post.coin!, true)} <span className="muted text-sm font-semibold tracking-normal">{up ? "↑" : "↓"} {fmtPrice(target)}</span></div>
            <div className="mono when mt-2">{fromPx ? `from ${fmtPrice(fromPx)} · ${fmtPct(pctToTarget, 1)}` : up ? "up" : "down"}{deadline ? ` · by ${deadline.toLocaleDateString("en-US", { weekday: "short" })}` : ""}{post.invalidPx ? ` · invalid ${up ? "below" : "above"} ${fmtPrice(post.invalidPx)}` : ""}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="pnl mono" style={{ fontSize: 22 }}>{open ? `${Math.round(progress)}%` : fmtPrice(post.resolvedPx)}</div>
          <div className="when">{open ? `to target · ${leftTxt}` : `resolved ${resolvedAt ? timeAgo(resolvedAt) + " ago" : ""}`}</div>
        </div>
      </div>
      <div className="track"><b style={{ width: `${open ? progress : 100}%`, background: open ? "var(--text)" : post.callStatus === "hit" ? "var(--green)" : "var(--red)" }} /></div>
      {post.body && <p className="say">{post.body}</p>}
      <Acts item={item} onChanged={onChanged}>
        {open && <Link href={`/trade?coin=${post.coin}&side=${post.side}`} className="copy ml-auto">Trade it</Link>}
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
      <p className="say">{item.post.body}</p>
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
          <div className="duelist"><Link href={`/u/${winner}`}><Avatar handle={winner} size={48} /></Link><div className="name mt-1.5">{winner}</div><span className="lbl long mt-1"><i />Won</span></div>
          <div className="duel-mid"><div className="mono muted text-xs">{post.coin}</div><div className="duel-bar"><i style={{ width: "100%" }} /></div><div className="when">{meta.start ? `${fmtPrice(Number(meta.start))} → ${fmtPrice(Number(meta.end))}` : "settled"}</div></div>
          <div className="duelist"><Link href={`/u/${loser}`}><Avatar handle={loser} size={48} /></Link><div className="name mt-1.5">{loser}</div><span className="lbl short mt-1"><i />Lost</span></div>
        </div>
        <Acts item={item} onChanged={onChanged}>
          <Link href={`/u/${winner}`} className="chip ml-auto">Challenge {winner}</Link>
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
        {typeof meta.postId === "number" && <Link href={`/post/${meta.postId}`} className="chip ml-auto">Receipt</Link>}
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

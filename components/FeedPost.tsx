"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { fmtUsd, fmtPct, pnlForPosition, timeAgo, fmtPrice } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar, CoinMark, Icon, I, ticker } from "./ui";

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

/* ---------- trade ---------- */

function TradePost({ item, mid, onChanged }: Props) {
  const { post, author } = item;
  const { profile } = useSession();
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

  return (
    <article className="post">
      <Who item={item} right={<span className={`lbl ${isOpen ? post.side : "done"}`}>{isOpen && <i />}{post.side === "long" ? "Long" : "Short"} {lev}×</span>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <Link href={`/markets/${post.coin}`} className="coin">{ticker(post.coin!, true)}</Link>
            <div className="mono when mt-2">
              {showSize ? `${fmtUsd(Number(post.notionalUsd), { compact: true })} · ` : ""}
              {isOpen ? `in at ${fmtPrice(entry)}` : `${fmtPrice(entry)} → ${fmtPrice(mark)}`}
            </div>
          </div>
        </div>
        <div ref={pillRef} className={`pnlpill ${pos ? "g" : "r"}`} onClick={() => setMode(((mode + 1) % 3) as 0 | 1 | 2)} title="Tap to switch % / $ / ROI">
          <div className={`pnl mono ${pos ? "green" : "red"}`}>{labels[0]}</div>
          <div className={`mono text-[13px] ${pos ? "green" : "red"}`}>{labels[1]}{!isOpen && mode === 0 ? " banked" : ""}</div>
        </div>
      </div>
      <div className="track"><b style={{ width: `${Math.min(100, Math.abs(roi))}%`, background: pos ? "var(--green)" : "var(--red)" }} /></div>
      {camps >= 3 ? (
        <div className="camps"><span><b>{item.copyCount} copied</b></span><span className="faint text-[11px] font-extrabold">vs</span><span><b>{item.fadeCount} faded</b></span></div>
      ) : isOpen ? (
        <div className="camps"><span>Be the first to copy or fade this one</span></div>
      ) : null}
      {post.body && <p className="say">{post.body}</p>}
      <Acts item={item} onChanged={onChanged}>
        {isOpen && author && author.id !== profile?.id && (
          <>
            <Link href={`/trade?fade=${post.id}`} className="fade ml-auto">Fade</Link>
            <Link href={`/trade?copy=${post.id}`} className="copy">Copy</Link>
          </>
        )}
      </Acts>
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
    <article className="post">
      <Who item={item} right={<>{post.backedPostId && <span className="lbl backed">Backed</span>}<span className={`lbl ${open ? "call" : post.callStatus === "hit" ? "long" : "short"}`}><i />{open ? "Call" : post.callStatus === "hit" ? "Hit" : "Missed"}</span></>} />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinMark coin={post.coin!} />
          <div>
            <div className="coin">{ticker(post.coin!, true)} <span className="muted text-sm font-semibold tracking-normal">{up ? "↑" : "↓"} {fmtPrice(target)}</span></div>
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
    <article className="post">
      <Who item={item} right={<span className="lbl done">Poll{post.settle ? " · settles on price" : ""}</span>} />
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
    <article className="post">
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
  const icon = t === "liquidation" ? I.bolt : t === "milestone" ? I.trophy : t === "settled" || t === "duel_settled" ? I.list : I.markets;
  const title = t === "liquidation" ? "Liquidation" : t === "milestone" ? "Milestone" : t === "settled" ? "Settled" : t === "duel_settled" ? "Duel settled" : "Market";
  const tint = t === "liquidation" ? "red" : t === "milestone" || t === "settled" ? "green" : t === "duel_settled" ? "gold" : "brand";
  return (
    <article className="post sys">
      <div className="flex items-center gap-3">
        <div className="sysico" style={{ background: `var(--${tint}-soft)`, color: `var(--${tint})` }}><Icon d={icon} /></div>
        <div><div className="name">{title}</div><div className="when">{timeAgo(post.createdAt)} ago</div></div>
      </div>
      <p className="say mt-3">{post.body}</p>
      <Acts item={item} onChanged={onChanged}>
        {(post.meta as { postId?: number } | null)?.postId && <Link href={`/post/${(post.meta as { postId: number }).postId}`} className="chip ml-auto">Receipt</Link>}
      </Acts>
    </article>
  );
}

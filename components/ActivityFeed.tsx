"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { fmtPct, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, SkeletonList, ticker } from "./ui";
import { Glyph } from "./Glyph";
import type { ActivityItem } from "@/app/api/profile/[handle]/activity/route";

const ALL: ActivityItem["type"][] = ["open", "close", "copy", "fade", "call", "post", "poll", "battle", "comment", "like", "dislike"];
const FILTERS = {
  all: { label: "All", types: ALL },
  posts: { label: "Posts & calls", types: ["post", "call", "poll"] },
  trades: { label: "Trades", types: ["open", "close", "copy"] },
  fades: { label: "Fades", types: ["fade", "battle"] },
  social: { label: "Likes & comments", types: ["comment", "like", "dislike"] },
} satisfies Record<string, { label: string; types: ActivityItem["type"][] }>;
type Filter = keyof typeof FILTERS;

const REASON: Record<string, string> = { tp: "Take profit", sl: "Stop loss", liquidation: "Liquidated", manual: "Closed" };
const Side = ({ side, lev }: { side?: string | null; lev?: number | null }) => side ? <span className={`mo-side ${side}`}>{side === "long" ? "Long" : "Short"}{lev ? ` ${lev}×` : ""}</span> : null;

/** One moment in a trader's story, drawn as what it is: a trade, a result, a fight, a call or something they said. */
function Moment({ it, me }: { it: ActivityItem; me: { handle: string; avatarUrl: string | null } }) {
  const when = <span className="mo-when">{timeAgo(it.at)}</span>;
  switch (it.type) {
    case "open": case "copy": case "fade":
      return (
        <Link href={it.href} className="mo">
          <span className="mo-coin">{it.coin && <CoinMark coin={it.coin} size="sm" />}</span>
          <span className="mo-main">
            <span className="mo-title">{it.type === "open" ? "Opened" : it.type === "copy" ? "Copied" : "Faded"} <b>{ticker(it.coin ?? "")}</b> <Side side={it.side} lev={it.lev} /></span>
            {it.who && <span className="mo-sub"><Avatar handle={it.who} url={it.whoAvatar ?? null} size={16} link={false} />{it.type === "fade" ? "against" : "after"} <b>{it.who}</b></span>}
          </span>
          {it.type === "fade" ? <span className="mo-tag fade gl"><Glyph n="bolt" />Fade</span> : when}
        </Link>
      );
    case "close": {
      const r = it.roi ?? 0, liq = it.reason === "liquidation";
      return (
        <Link href={it.href} className={`mo result ${r >= 0 ? "up" : "down"}`}>
          <span className="mo-coin">{it.coin && <CoinMark coin={it.coin} size="sm" />}</span>
          <span className="mo-main">
            <span className="mo-title"><b>{ticker(it.coin ?? "")}</b> <Side side={it.side} lev={it.lev} /></span>
            <span className="mo-sub">{liq ? <span className="gl"><Glyph n="skull" tone="blood" />Liquidated</span> : REASON[it.reason ?? "manual"] ?? "Closed"} · {timeAgo(it.at)}</span>
          </span>
          <span className={`mo-roi mono ${r >= 0 ? "green" : "red"}`}>{fmtPct(r, 1)}</span>
        </Link>
      );
    }
    case "battle": {
      const res = it.won === true ? "won" : it.won === false ? "lost" : it.mine == null ? "live" : "draw";
      return (
        <Link href={it.href} className={`mo fight ${res}`}>
          <span className="mo-vs">
            <Avatar handle={me.handle} url={me.avatarUrl} size={30} link={false} />
            <Avatar handle={it.who ?? "?"} url={it.whoAvatar ?? null} size={30} link={false} />
          </span>
          <span className="mo-main">
            <span className="mo-title">{res === "live" ? "Fighting" : res === "won" ? "Perped" : res === "lost" ? "Perped by" : "Drew with"} <b>{it.who}</b></span>
            <span className="mo-sub">{it.coin && <>{ticker(it.coin)} · </>}{it.mine != null && it.theirs != null ? <span className="mono">{fmtPct(it.mine, 1)} vs {fmtPct(it.theirs, 1)}</span> : "live now"}</span>
          </span>
          <span className={`mo-res ${res}`}>{res === "won" ? "WON" : res === "lost" ? "LOST" : res === "draw" ? "DRAW" : "LIVE"}</span>
        </Link>
      );
    }
    case "call": {
      const st = it.status ?? "open";
      return (
        <Link href={it.href} className="mo">
          <span className="mo-coin">{it.coin && <CoinMark coin={it.coin} size="sm" />}</span>
          <span className="mo-main">
            <span className="mo-title">Called <b>{ticker(it.coin ?? "")}</b> <span className={`mo-side ${it.side}`}>{it.side === "long" ? "↑ higher" : "↓ lower"}</span></span>
            <span className="mo-sub">{timeAgo(it.at)} ago</span>
          </span>
          <span className={`mo-res ${st === "hit" ? "won" : st === "missed" ? "lost" : "live"}`}>{st === "hit" ? "HIT" : st === "missed" ? "MISSED" : "OPEN"}</span>
        </Link>
      );
    }
    case "post": case "poll": case "comment":
      return (
        <Link href={it.href} className="mo say">
          <span className="mo-main">
            <span className="mo-kicker">{it.type === "poll" ? "Asked" : it.type === "comment" ? <>Replied to <b>{it.who}</b></> : "Posted"} {when}</span>
            <span className="mo-quote">{it.body ?? it.text}</span>
          </span>
        </Link>
      );
    default:
      return null;
  }
}

/** Likes and dislikes on one day, folded into one line with the faces they reacted to. */
function Reactions({ items }: { items: ActivityItem[] }) {
  const likes = items.filter((i) => i.type === "like").length, dislikes = items.length - likes;
  const faces = [...new Map(items.filter((i) => i.who).map((i) => [i.who!, i])).values()].slice(0, 5);
  return (
    <div className="mo react">
      <span className="mo-stack">{faces.map((f) => <Avatar key={f.who} handle={f.who!} url={f.whoAvatar ?? null} size={22} link={false} />)}</span>
      <span className="mo-main"><span className="mo-sub">{[likes && `Liked ${likes}`, dislikes && `disliked ${dislikes}`].filter(Boolean).join(" · ")} {items.length === 1 ? "post" : "posts"}{faces.length ? <> from <b>{faces.map((f) => f.who).slice(0, 2).join(", ")}</b>{faces.length > 2 ? ` +${faces.length - 2}` : ""}</> : null}</span></span>
    </div>
  );
}

/** Everything a trader did, newest first, day by day: trades, results, fights, calls, posts; likes folded per day. */
export function ActivityFeed({ handle, me }: { handle: string; me: { handle: string; avatarUrl: string | null } }) {
  const { data } = useSWR<{ items: ActivityItem[] }>(`/api/profile/${handle}/activity`, { refreshInterval: 30_000 });
  const [f, setF] = useState<Filter>("all");
  if (!data) return <SkeletonList n={4} card={false} />;
  if (!data.items.length) return <p className="muted p-5 text-sm">Nothing yet. The first trade starts the story.</p>;
  const items = data.items.filter((it) => (FILTERS[f].types as readonly ActivityItem["type"][]).includes(it.type));
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const it of items) {
    const d = new Date(it.at); const day = d.toDateString() === new Date().toDateString() ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(it); else groups.push({ day, items: [it] });
  }
  return (
    <div className="act">
      <div className="act-filters">{(Object.keys(FILTERS) as Filter[]).map((k) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{FILTERS[k].label}</button>)}</div>
      {!items.length && <p className="muted p-5 text-sm">Nothing here yet.</p>}
      {groups.map((g) => {
        const reacts = g.items.filter((i) => i.type === "like" || i.type === "dislike");
        const rest = g.items.filter((i) => i.type !== "like" && i.type !== "dislike");
        return (
          <div key={g.day} className="mo-day">
            <div className="act-day">{g.day}</div>
            <div className="mo-list">
              {rest.map((it, i) => <Moment key={`${it.type}-${it.at}-${i}`} it={it} me={me} />)}
              {reacts.length > 0 && <Reactions items={reacts} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

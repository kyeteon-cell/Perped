"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { timeAgo } from "@/lib/format";
import { CoinMark, Icon, I, SkeletonList } from "./ui";
import type { ActivityItem } from "@/app/api/profile/[handle]/activity/route";

const ICON: Record<ActivityItem["type"], { d: string; tint: string }> = {
  open: { d: I.markets, tint: "blue" }, close: { d: I.check, tint: "green" }, copy: { d: I.copy, tint: "brand" }, fade: { d: I.bolt, tint: "violet" },
  call: { d: I.trophy, tint: "blue" }, post: { d: I.comment, tint: "muted" }, poll: { d: I.list, tint: "violet" }, battle: { d: I.bolt, tint: "gold" },
  comment: { d: I.comment, tint: "muted" }, like: { d: I.like, tint: "green" }, dislike: { d: I.dislike, tint: "red" },
};

const ALL: ActivityItem["type"][] = ["open", "close", "copy", "fade", "call", "post", "poll", "battle", "comment", "like", "dislike"];
const FILTERS = {
  all: { label: "All", types: ALL },
  posts: { label: "Posts & calls", types: ["post", "call", "poll"] },
  trades: { label: "Trades", types: ["open", "close", "copy"] },
  fades: { label: "Fades", types: ["fade", "battle"] },
  social: { label: "Likes & comments", types: ["comment", "like", "dislike"] },
} satisfies Record<string, { label: string; types: ActivityItem["type"][] }>;
type Filter = keyof typeof FILTERS;

/** Everything a trader did, newest first: opens, closes, copies, fades, battles, calls, posts, comments, likes. */
export function ActivityFeed({ handle }: { handle: string }) {
  const { data } = useSWR<{ items: ActivityItem[] }>(`/api/profile/${handle}/activity`, { refreshInterval: 30_000 });
  const [f, setF] = useState<Filter>("all");
  if (!data) return <SkeletonList n={4} card={false} />;
  if (!data.items.length) return <p className="muted p-5 text-sm">Nothing yet. The first trade starts the story.</p>;
  const items = data.items.filter((it) => FILTERS[f].types.includes(it.type));
  // Group by day so a long stream still scans.
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
      {groups.map((g) => (
        <div key={g.day}>
          <div className="act-day">{g.day}</div>
          {g.items.map((it, i) => {
            const ic = ICON[it.type];
            const tone = it.type === "close" ? ((it.roi ?? 0) >= 0 ? "green" : "red") : it.type === "battle" ? (it.won === true ? "gold" : it.won === false ? "red" : "muted") : ic.tint;
            return (
              <Link key={`${it.type}-${it.at}-${i}`} href={it.href} className="act-row">
                <span className={`act-ic ${tone}`}><Icon d={ic.d} size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{it.text}</span>
                  <span className="when text-[11px]">{timeAgo(it.at)} ago</span>
                </span>
                {it.coin && <CoinMark coin={it.coin} size="xs" />}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

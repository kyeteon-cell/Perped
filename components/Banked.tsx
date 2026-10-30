"use client";

import Link from "next/link";
import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, ticker } from "./ui";

/**
 * "Banked": a slow marquee of recently closed trades across the Home screen. Closed trades don't
 * appear in the For you feed; this is where they live, as a stream of results. Tap one for the thread.
 */
export function Banked() {
  const { data } = useSWR<{ posts: FeedRow[] }>("/api/posts?kind=trade&status=closed&limit=20", { refreshInterval: 30_000 });
  const rows = (data?.posts ?? []).filter((r) => r.author && r.post.entryPx && r.post.exitPx);
  if (!rows.length) return null;
  const items = [...rows, ...rows]; // duplicated for a seamless loop
  return (
    <section className="banked" aria-label="Recently closed trades">
      <div className="bk-label">Banked</div>
      <div className="bk-track" style={{ animationDuration: `${Math.max(30, rows.length * 6)}s` }}>
        {items.map((r, i) => {
          const { post, author } = r;
          const entry = Number(post.entryPx), exit = Number(post.exitPx), size = Number(post.size);
          const { pnl, pct } = pnlForPosition(post.side!, entry, exit, size);
          const roi = pct * (post.leverage ?? 1);
          const win = pnl >= 0;
          return (
            <Link key={`${post.id}-${i}`} href={`/post/${post.id}`} className={`bk ${win ? "win" : "loss"}`}>
              <Avatar handle={author!.handle} url={author!.avatarUrl} size={22} />
              <b>{author!.handle}</b>
              <CoinMark coin={post.coin!} size="xs" />
              <span className="muted">{ticker(post.coin!)} {post.side} {post.leverage}×</span>
              <span className={`mono font-bold ${win ? "green" : "red"}`}>{fmtPct(roi, 1)}</span>
              <span className={`mono ${win ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</span>
              <span className="when">{timeAgo(post.closedAt ?? post.createdAt)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

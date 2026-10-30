"use client";

import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import { pnlForPosition } from "@/lib/format";

/**
 * Live demo account: cash (what's not in a position), margin tied up in open trades, unrealised P&L at the
 * current mid, and equity = cash + margin + unrealised. Refreshes with every price tick via `mids`.
 */
export function useDemoEquity(handle: string | null | undefined, cash: number, mids: Record<string, number>) {
  const { data, mutate } = useSWR<{ posts: FeedRow[] }>(handle ? `/api/posts?handle=${handle}&kind=trade&status=open&limit=50` : null, { refreshInterval: 15_000 });
  const open = data?.posts ?? [];
  let margin = 0, upnl = 0;
  for (const { post } of open) {
    const lev = post.leverage ?? 1, entry = Number(post.entryPx), size = Number(post.size);
    margin += Number(post.notionalUsd) / lev;
    const mid = mids[post.coin ?? ""] ?? entry;
    upnl += pnlForPosition(post.side as "long" | "short", entry, mid, size).pnl;
  }
  const equity = cash + margin + upnl;
  return { cash, margin, upnl, equity, openCount: open.length, loaded: !!data, refresh: mutate, roi: margin ? (upnl / margin) * 100 : 0 };
}

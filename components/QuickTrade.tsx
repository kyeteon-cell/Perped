"use client";

import { useEffect } from "react";
import { Sheet } from "./Sheet";
import { track } from "@/lib/track";
import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import { TradeTicket } from "./TradeTicket";
import { Avatar, CoinMark, ticker } from "./ui";
import { autoStopDist } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";

/**
 * Quick trade: a bottom sheet with just side, margin and leverage, pre-filled from the post you swiped.
 * Copy keeps their side and leverage; fade flips the side. Same ticket logic as the full page underneath.
 */
export function QuickTrade({ item, mode, onClose, lock = false, title }: { item: FeedRow; mode: "copy" | "fade"; onClose: () => void; lock?: boolean; title?: string }) {
  const { post, author } = item;
  const { profile } = useSession();
  const { data: me } = useSWR<{ stats: { closedTrades: number } | null }>(profile ? `/api/profile/${profile.handle}` : null);
  const s = post.side as "long" | "short";
  const side = mode === "fade" ? (s === "long" ? "short" : "long") : s;
  useEffect(() => { if (mode === "fade") track("quick_fade_open"); }, [mode]);
  const seed = { coin: post.coin!, side, leverage: post.leverage ?? 2, copiedFromId: mode === "copy" ? post.id : undefined, fadedFromId: mode === "fade" ? post.id : undefined, handle: author?.handle, closedTrades: me?.stats?.closedTrades ?? 0, lockLev: mode === "fade" || lock, toBattle: mode === "fade" };
  return (
    <Sheet className="qt" label={mode === "copy" ? "Copy trade" : "Quick fade"} onClose={onClose}>
        <div className="flex items-center gap-3 px-5 pb-1" data-sheet-handle>
          <Avatar handle={author?.handle ?? "?"} url={author?.avatarUrl} size={36} link={false} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold">{title ?? (mode === "copy" ? "Copy" : "⚡ Quick fade")} {author?.handle}</div>
            <div className="when">They&rsquo;re <span className={s === "long" ? "green" : "red"}>{s}</span> {ticker(post.coin!)} {post.leverage}× · you go <b className={side === "long" ? "green" : "red"}>{side}</b></div>
          </div>
          <CoinMark coin={post.coin!} size="sm" />
        </div>
        <TradeTicket key={mode} seed={seed} compact quick onDone={onClose} />
        <p className="faint px-5 pb-2 text-center text-[11px]">{mode === "fade" ? `Same ${post.leverage}× leverage, opposite side, stop loss ${(autoStopDist(post.leverage ?? 1) * 100).toFixed(1)}% away (−${Math.round(autoStopDist(post.leverage ?? 1) * (post.leverage ?? 1) * 100)}% of your margin). You land straight in the battle. ` : "Want limit orders, TP/SL or a note? "}<a href={`/trade?${mode}=${post.id}`} className="underline">Open the full ticket</a></p>
    </Sheet>
  );
}

/** Build the minimal feed item a quick sheet needs from a battle leg (arena rows and battle pages). */
export function legItem(p: { id: number; coin: string; side: "long" | "short"; leverage: number }, author: { handle: string; avatarUrl: string | null }): FeedRow {
  return { post: { id: p.id, kind: "trade", coin: p.coin, side: p.side, leverage: p.leverage, status: "open" }, author } as unknown as FeedRow;
}

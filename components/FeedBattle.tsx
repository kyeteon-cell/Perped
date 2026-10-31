"use client";

import useSWR from "swr";
import type { ReactNode } from "react";
import type { Post } from "@/lib/schema";
import { useMids } from "@/lib/hooks/useMids";
import { pnlForPosition } from "@/lib/format";
import { BattleLadder, type Fighter } from "./BattleArena";

type U = { handle: string; avatarUrl: string | null };
type Res = { fade?: Post; target?: Post; fader?: { user: U }; targetUser?: { user: U }; error?: string };

/** A fade in the feed: shows the head-to-head price ladder; falls back to the plain trade chart until loaded. */
export function FeedBattle({ postId, fallback }: { postId: number; fallback: ReactNode }) {
  const { data } = useSWR<Res>(`/api/battle/${postId}`, { refreshInterval: 30_000, revalidateOnFocus: false });
  const { mids } = useMids();
  if (!data || data.error || !data.fade || !data.target || !data.fader || !data.targetUser) return <>{fallback}</>;
  const { fade, target } = data;
  const live = mids[fade.coin!] ?? Number(fade.entryPx);
  const f = (u: U, p: Post): Fighter => {
    const entry = Number(p.entryPx), lev = p.leverage ?? 1;
    const { pct } = pnlForPosition(p.side!, entry, p.status === "open" ? live : Number(p.exitPx ?? entry), Number(p.size));
    return { handle: u.handle, avatarUrl: u.avatarUrl, side: p.side as "long" | "short", lev, entry, tp: p.tpPx ? Number(p.tpPx) : null, sl: p.slPx ? Number(p.slPx) : null, openedAt: p.createdAt, roi: pct * lev };
  };
  return <BattleLadder battleId={postId} live={live} a={f(data.targetUser.user, target)} b={f(data.fader.user, fade)} />;
}

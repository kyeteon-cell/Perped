"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { TradeTicket, type Seed } from "@/components/TradeTicket";
import { Icon, I } from "@/components/ui";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";

/** /trade?copy=ID | ?fade=ID | ?coin=SOL&side=long[&backs=CALLID] — the ticket pre-filled from a post. */
function TradeInner() {
  const sp = useSearchParams();
  const { profile } = useSession();
  const copy = sp.get("copy"), fade = sp.get("fade"), duelId = sp.get("duel");
  const { data: duel } = useSWR<{ duel: { id: number; coin: string; challengerSide: "long" | "short"; stakeUsd: string }; role: "challenger" | "opponent" | "viewer"; opponent: { handle: string }; challenger: { handle: string } }>(duelId ? `/api/duels/${duelId}` : null);
  const srcId = copy ?? fade;
  const { data: src } = useSWR<{ post: FeedRow }>(srcId ? `/api/posts/${srcId}` : null);
  const { data: me } = useSWR<{ stats: { closedTrades: number } | null }>(profile ? `/api/profile/${profile.handle}` : null);
  const row = src?.post;

  let seed: Seed = { coin: (sp.get("coin") ?? "SOL").toUpperCase(), side: (sp.get("side") as "long" | "short") ?? "long", backsCallId: sp.get("backs") ? Number(sp.get("backs")) : undefined, closedTrades: me?.stats?.closedTrades ?? 0 };
  if (row) {
    const s = row.post.side!;
    seed = { ...seed, coin: row.post.coin!, side: fade ? (s === "long" ? "short" : "long") : s, leverage: fade ? 2 : row.post.leverage ?? 2, copiedFromId: copy ? row.post.id : undefined, fadedFromId: fade ? row.post.id : undefined, handle: row.author?.handle };
  }
  if (duel && duel.role !== "viewer") {
    const d = duel.duel;
    const side = duel.role === "opponent" ? (d.challengerSide === "long" ? "short" : "long") : d.challengerSide;
    seed = { ...seed, coin: d.coin, side, usd: Number(d.stakeUsd), duelId: d.id, duelRole: duel.role, handle: duel.role === "opponent" ? duel.challenger.handle : duel.opponent.handle };
  }
  if ((srcId && !src) || (duelId && !duel)) return <p className="muted p-5 text-sm">Loading…</p>;

  return (
    <div data-tint="blue">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href={`/markets/${seed.coin}`} className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link>
        <div className="name">{duelId ? "Duel · your side" : fade ? "Fade" : copy ? "Copy trade" : "Trade"}</div>
        <span className="w-9" />
      </header>
      <TradeTicket seed={seed} />
    </div>
  );
}

export default function TradePage() {
  return <Suspense fallback={<p className="muted p-5 text-sm">Loading…</p>}><TradeInner /></Suspense>;
}

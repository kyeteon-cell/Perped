"use client";

import { useRouter } from "next/navigation";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtStake, fmtUsd, pnlForPosition } from "@/lib/format";
import { CoinMark, ticker } from "./ui";
import { BattleSummary, battlesOf } from "./BattleSummary";

/**
 * The trophy card on a profile: the result, how hard it was (leverage, margin, held), who it beat, the
 * trade's battle record, and how the crowd took it (copied / faded). Gold edge when it won a battle.
 */
export function PinCard({ item, roi }: { item: FeedRow; roi: number }) {
  const router = useRouter();
  const { post } = item;
  const live = post.status === "open";
  const lev = post.leverage ?? 1, margin = Number(post.notionalUsd) / lev;
  const entry = Number(post.entryPx), exit = Number(post.exitPx ?? entry);
  const pnl = live ? (roi / 100) * margin : pnlForPosition(post.side!, entry, exit, Number(post.size)).pnl;
  const battles = battlesOf(post.meta);
  const wins = battles.filter((b) => b.won === true).length;
  const reason = (post.meta as { closeReason?: string } | null)?.closeReason;
  const held = post.closedAt ? Math.max(1, Math.round((new Date(post.closedAt).getTime() - new Date(post.createdAt).getTime()) / 60_000)) : 0;
  const heldTxt = held >= 1440 ? `${Math.round(held / 1440)}d` : held >= 60 ? `${Math.round(held / 60)}h` : `${held}m`;
  const tier = wins >= 3 ? "legend" : wins >= 1 ? "won" : "";
  return (
    <div className={`pincard ${tier}`} role="link" tabIndex={0} onClick={() => router.push(`/post/${post.id}`)}>
      <div className="flex items-center gap-2">
        <CoinMark coin={post.coin!} size="sm" />
        <b className="text-[15px]">{ticker(post.coin!)}</b>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold ${post.side === "long" ? "pc-long" : "pc-short"}`}>{post.side === "long" ? "LONG" : "SHORT"} {lev}×</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className={`mono text-[28px] font-bold leading-none ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, Math.abs(roi) < 10 ? 1 : 0)}</span>
        <span className={`mono text-[12px] ${pnl >= 0 ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true, compact: Math.abs(pnl) >= 10_000 })}</span>
      </div>
      {battles.length > 0 && <div className="mt-2"><BattleSummary battles={battles} size="sm" /></div>}
      <div className="pc-chips mt-2">
        {live ? <span className="pc-chip live">● LIVE</span> : reason === "tp" ? <span className="pc-chip good">TP hit</span> : reason === "liquidation" ? <span className="pc-chip bad">Liquidated</span> : null}
        {item.copyCount > 0 && <span className="pc-chip">{item.copyCount} copied</span>}
        {item.fadeCount > 0 && <span className="pc-chip">{item.fadeCount} faded</span>}
        {wins >= 3 && <span className="pc-chip gold">Giant slayer</span>}
      </div>
      <div className="when mt-2 text-[11px]">{fmtStake(margin)} margin{live ? "" : ` · held ${heldTxt}`} · {new Date(post.closedAt ?? post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
    </div>
  );
}

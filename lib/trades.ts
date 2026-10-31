import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { pnlForPosition } from "./format";
import { systemPost, notify } from "./feed";
import { getMids } from "./hl-info";
import { awardXp } from "./xp";
import { lossPenalty, rankFor, XP } from "./rank";

export type CloseReason = "manual" | "tp" | "sl" | "liquidation";

/**
 * Close (or partially close) a trade post. Demo trades settle against the live mid and credit the demo balance;
 * real trades record the exit the caller got on Hyperliquid. Shared by the close API and the cron that enforces
 * demo take-profit / stop-loss / liquidation. A partial close books the realised P&L on the closed slice and
 * keeps the post open with the smaller size.
 */
export async function closeTradePost(postId: number, userId: string, opts: { exitPx?: number; fraction?: number; reason?: CloseReason; trusted?: boolean }) {
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post || post.kind !== "trade" || post.userId !== userId) return { error: "not found", status: 404 } as const;
  if (post.status === "closed") return { post } as const;
  let reason = opts.reason ?? "manual";
  const fraction = Math.min(1, Math.max(0.01, opts.fraction ?? 1));

  let exitPx = opts.exitPx ?? Number(post.entryPx);
  if (post.paper && !opts.trusted) {
    // Demo trades settle at the live mid on the server; never at a price the client sent.
    const mids = await getMids().catch(() => ({} as Record<string, string>));
    const mid = Number(mids[post.coin!] ?? 0);
    if (!mid) return { error: "no live price right now, try again in a moment", status: 503 } as const;
    exitPx = mid;
  }
  const size = Number(post.size), notional = Number(post.notionalUsd), lev = post.leverage ?? 1;
  const sliceSize = size * fraction, sliceNotional = notional * fraction, sliceMargin = sliceNotional / lev;
  const { pnl, pct } = pnlForPosition(post.side!, Number(post.entryPx), exitPx, sliceSize);
  // A loss can never exceed the margin on the slice: past that point it was a liquidation.
  if (lev > 1 && pnl <= -sliceMargin) reason = "liquidation";
  const finalPnl = reason === "liquidation" ? -sliceMargin : pnl;

  const meta = (post.meta ?? {}) as Record<string, unknown>;
  const prevRealised = Number(meta.realizedSoFar ?? 0);
  const credit = async () => {
    if (post.paper) await db.update(schema.users).set({ demoBalance: sql`greatest(0, ${schema.users.demoBalance} + ${(sliceMargin + finalPnl).toFixed(2)})` }).where(eq(schema.users.id, userId));
  };
  if (fraction < 1 && reason !== "liquidation") {
    const partials = [...((meta.partials as { px: number; size: number; pnl: number; at: string }[] | undefined) ?? []), { px: exitPx, size: sliceSize, pnl: finalPnl, at: new Date().toISOString() }];
    // Claim the slice: only succeeds if nobody else changed the position since we read it.
    const [updated] = await db.update(schema.posts)
      .set({ size: String(size - sliceSize), notionalUsd: String(notional - sliceNotional), meta: { ...meta, partials, realizedSoFar: prevRealised + finalPnl } })
      .where(and(eq(schema.posts.id, post.id), eq(schema.posts.status, "open"), eq(schema.posts.size, post.size!))).returning();
    if (!updated) return { error: "position changed, refresh and try again", status: 409 } as const;
    await credit();
    return { post: updated, partial: true } as const;
  }
  // A full close (or liquidation) always takes the whole remaining position.
  const fullMargin = notional / lev;
  const fullPnl = reason === "liquidation" ? -fullMargin : fraction < 1 ? pnlForPosition(post.side!, Number(post.entryPx), exitPx, size).pnl : finalPnl;
  const total = prevRealised + fullPnl;
  // Claim the close atomically so a double tap or the cron racing a manual close can't settle it twice.
  const [updated] = await db.update(schema.posts)
    .set({ status: "closed", exitPx: String(exitPx), realizedPnl: total.toFixed(4), closedAt: new Date(), meta: { ...meta, closeReason: reason } })
    .where(and(eq(schema.posts.id, post.id), eq(schema.posts.status, "open"))).returning();
  if (!updated) {
    const [now] = await db.select().from(schema.posts).where(eq(schema.posts.id, post.id)).limit(1);
    return { post: now } as const;
  }
  if (post.paper) await db.update(schema.users).set({ demoBalance: sql`greatest(0, ${schema.users.demoBalance} + ${(fullMargin + fullPnl).toFixed(2)})` }).where(eq(schema.users.id, userId));

  {
    const [ux] = await db.select({ xp: schema.users.xp }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const liqPen = reason === "liquidation" ? lossPenalty(rankFor(ux?.xp ?? 0).level, "liquidation") : 0;
    await awardXp(userId, reason === "liquidation" ? (liqPen < 0 ? liqPen : XP.liquidation) : total > 0 ? XP.tradeWin : XP.tradeLoss, reason === "liquidation" ? "liquidation" : total > 0 ? "trade_win" : "trade_loss", `post:${post.id}`);
  }
  const [me] = await db.select({ handle: schema.users.handle, showLiquidations: schema.users.showLiquidations }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const roi = pct * lev;
  if (reason === "liquidation" && me?.showLiquidations) {
    await systemPost("liquidation", `${me.handle} got perped. −$${Math.abs(total).toFixed(0)} on ${post.coin} ${lev}× ${post.side}, liquidated at ${exitPx}.`, { handle: me.handle, pnl: total, coin: post.coin, postId: post.id }, post.coin ?? undefined);
  }
  if (reason === "tp") await notify(userId, "tp", `Take profit hit on ${post.coin}`, `Closed ${post.side} at ${exitPx} · ${total >= 0 ? "+" : "−"}$${Math.abs(total).toFixed(2)}`, `/post/${post.id}`);
  if (reason === "sl") await notify(userId, "sl", `Stop loss hit on ${post.coin}`, `Closed ${post.side} at ${exitPx} · ${total >= 0 ? "+" : "−"}$${Math.abs(total).toFixed(2)}`, `/post/${post.id}`);
  if (reason === "liquidation") await notify(userId, "liquidation", `Liquidated on ${post.coin}`, `${lev}× ${post.side} hit the liquidation price. Margin gone.`, `/post/${post.id}`);
  if (roi >= 100) {
    await systemPost("milestone", `${me?.handle} just hit ${(roi / 100 + 1).toFixed(1)}× on ${post.coin} ${post.side} and banked it.`, { handle: me?.handle, roi, coin: post.coin, postId: post.id }, post.coin ?? undefined);
  }
  const [copiers, faders] = await Promise.all([
    db.select({ id: schema.posts.id, userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.copiedFromId, post.id)),
    db.select({ id: schema.posts.id, userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.fadedFromId, post.id)),
  ]);
  if (copiers.length + faders.length >= 3) {
    await systemPost("settled", `${me?.handle} ${post.coin} ${post.side} closed ${pct >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%. ${copiers.length} copied, ${faders.length} faded.`, { handle: me?.handle, coin: post.coin, roi, copiers: copiers.length, faders: faders.length, postId: post.id }, post.coin ?? undefined);
    for (const f of faders) if (f.userId) await notify(f.userId, "settled", `${me?.handle}'s ${post.coin} trade settled`, `${pct >= 0 ? "They won" : "You won"} · ${pct >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%`, `/post/${post.id}`);
  }
  return { post: updated } as const;
}

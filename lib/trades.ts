import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { pnlForPosition } from "./format";
import { systemPost, notify } from "./feed";
import { getMids } from "./hl-info";

export type CloseReason = "manual" | "tp" | "sl" | "liquidation";

/**
 * Close (or partially close) a trade post. Demo trades settle against the live mid and credit the demo balance;
 * real trades record the exit the caller got on Hyperliquid. Shared by the close API and the cron that enforces
 * demo take-profit / stop-loss / liquidation. A partial close books the realised P&L on the closed slice and
 * keeps the post open with the smaller size.
 */
export async function closeTradePost(postId: number, userId: string, opts: { exitPx?: number; fraction?: number; reason?: CloseReason }) {
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post || post.kind !== "trade" || post.userId !== userId) return { error: "not found", status: 404 } as const;
  if (post.status === "closed") return { post } as const;
  const reason = opts.reason ?? "manual";
  const fraction = Math.min(1, Math.max(0.01, opts.fraction ?? 1));

  let exitPx = opts.exitPx ?? Number(post.entryPx);
  if (post.paper) {
    const mids = await getMids().catch(() => ({} as Record<string, string>));
    exitPx = Number(mids[post.coin!] ?? exitPx);
  }
  const size = Number(post.size), notional = Number(post.notionalUsd), lev = post.leverage ?? 1;
  const sliceSize = size * fraction, sliceNotional = notional * fraction;
  const { pnl, pct } = pnlForPosition(post.side!, Number(post.entryPx), exitPx, sliceSize);
  // A liquidation wipes the margin: the loss is the whole margin on the slice, never more.
  const finalPnl = reason === "liquidation" ? -(sliceNotional / lev) : pnl;

  if (post.paper) {
    const margin = sliceNotional / lev;
    const [u] = await db.select({ demoBalance: schema.users.demoBalance }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    await db.update(schema.users).set({ demoBalance: Math.max(0, Number(u?.demoBalance ?? 0) + margin + finalPnl).toFixed(2) }).where(eq(schema.users.id, userId));
  }

  const meta = (post.meta ?? {}) as Record<string, unknown>;
  const prevRealised = Number(meta.realizedSoFar ?? 0);
  if (fraction < 1) {
    const partials = [...((meta.partials as { px: number; size: number; pnl: number; at: string }[] | undefined) ?? []), { px: exitPx, size: sliceSize, pnl: finalPnl, at: new Date().toISOString() }];
    const [updated] = await db.update(schema.posts)
      .set({ size: String(size - sliceSize), notionalUsd: String(notional - sliceNotional), meta: { ...meta, partials, realizedSoFar: prevRealised + finalPnl } })
      .where(eq(schema.posts.id, post.id)).returning();
    return { post: updated, partial: true } as const;
  }

  const total = prevRealised + finalPnl;
  const [updated] = await db.update(schema.posts)
    .set({ status: "closed", exitPx: String(exitPx), realizedPnl: total.toFixed(4), closedAt: new Date(), meta: { ...meta, closeReason: reason } })
    .where(eq(schema.posts.id, post.id)).returning();

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

/** Demo liquidation price: where the loss equals the margin (no maintenance margin, for simplicity). */
export function demoLiqPx(side: "long" | "short", entry: number, lev: number) {
  return side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev);
}

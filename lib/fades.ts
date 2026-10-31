import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * May `userId` fade post `srcPostId`? One fade per person per trade, and no fading back: if the trade you're
 * fading is itself a fade of one of YOUR trades, you're already in that battle with them.
 * Returns null when allowed, or the reason it isn't.
 */
export async function fadeBlockReason(userId: string, srcPostId: number, mine?: { coin: string; side: string }): Promise<string | null> {
  const [src] = await db.select({ id: schema.posts.id, userId: schema.posts.userId, coin: schema.posts.coin, side: schema.posts.side, fadedFromId: schema.posts.fadedFromId, kind: schema.posts.kind, status: schema.posts.status }).from(schema.posts).where(eq(schema.posts.id, srcPostId)).limit(1);
  if (!src || src.kind !== "trade") return "that trade doesn't exist";
  if (src.status !== "open") return "that trade is already closed";
  if (src.userId === userId) return "you can't fade your own trade";
  if (mine && mine.coin.toUpperCase() !== src.coin) return `a fade has to be on ${src.coin}`;
  if (mine && mine.side === src.side) return "a fade takes the opposite side";
  const [already] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, userId), eq(schema.posts.fadedFromId, srcPostId))).limit(1);
  if (already) return "you've already faded this trade";
  if (src.fadedFromId) {
    const [orig] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, src.fadedFromId)).limit(1);
    if (orig?.userId === userId) return "they faded you on this trade, so you're already in a battle with them";
  }
  return null;
}

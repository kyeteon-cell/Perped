import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { pnlForPosition } from "./format";

/** ROI (%) at which a fighter counts as "getting perped" — the Bloodbath tab threshold. */
export const BLOODBATH_ROI = -20;

/**
 * "Someone you follow is getting perped": for every live battle where a fighter is at or below the Bloodbath line,
 * notify that fighter's followers once per battle (deduped on the battle link). Returns notifications sent.
 */
export async function alertBloodbath(mids: Record<string, string | number>): Promise<number> {
  const open = await db.select().from(schema.battles).where(eq(schema.battles.status, "open")).limit(300);
  if (!open.length) return 0;
  const postIds = [...new Set(open.flatMap((b) => [b.faderPostId, b.targetPostId]))];
  const posts = await db.select({ id: schema.posts.id, side: schema.posts.side, entryPx: schema.posts.entryPx, size: schema.posts.size, leverage: schema.posts.leverage, status: schema.posts.status }).from(schema.posts).where(inArray(schema.posts.id, postIds));
  const P = new Map(posts.map((p) => [p.id, p]));
  const hurting: { userId: string; oppId: string; battleHref: string; roi: number; coin: string }[] = [];
  for (const b of open) {
    const mid = Number(mids[b.coin] ?? 0); if (!mid) continue;
    for (const [postId, userId, oppId] of [[b.faderPostId, b.faderId, b.targetId], [b.targetPostId, b.targetId, b.faderId]] as const) {
      const p = P.get(postId); if (!p || p.status !== "open") continue;
      const roi = pnlForPosition(p.side as "long" | "short", Number(p.entryPx), mid, Number(p.size)).pct * (p.leverage ?? 1);
      if (roi <= BLOODBATH_ROI) hurting.push({ userId, oppId, battleHref: `/battle/${b.faderPostId}`, roi, coin: b.coin });
    }
  }
  if (!hurting.length) return 0;
  const userIds = [...new Set(hurting.flatMap((h) => [h.userId, h.oppId]))];
  const [users, follows] = await Promise.all([
    db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(inArray(schema.users.id, userIds)),
    db.select().from(schema.follows).where(inArray(schema.follows.followeeId, [...new Set(hurting.map((h) => h.userId))])),
  ]);
  const H = new Map(users.map((u) => [u.id, u.handle]));
  let sent = 0;
  for (const h of hurting) {
    const fans = follows.filter((f) => f.followeeId === h.userId && f.followerId !== h.oppId).map((f) => f.followerId);
    if (!fans.length) continue;
    const already = await db.select({ userId: schema.notifications.userId }).from(schema.notifications)
      .where(and(eq(schema.notifications.type, "bloodbath"), eq(schema.notifications.href, h.battleHref), inArray(schema.notifications.userId, fans)));
    const done = new Set(already.map((a) => a.userId));
    const todo = fans.filter((f) => !done.has(f)).slice(0, 200);
    if (!todo.length) continue;
    const who = H.get(h.userId) ?? "Someone", opp = H.get(h.oppId) ?? "their opponent";
    await db.insert(schema.notifications).values(todo.map((userId) => ({
      userId, type: "bloodbath", href: h.battleHref,
      title: `💀 ${who} is getting perped`,
      body: `${who} is ${h.roi.toFixed(0)}% on ${h.coin} against ${opp}. Watch it live.`,
    })));
    sent += todo.length;
  }
  return sent;
}

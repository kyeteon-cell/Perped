import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { pnlForPosition } from "./format";
import { pushTo } from "./push";

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
  const posts = await db.select({ id: schema.posts.id, coin: schema.posts.coin, side: schema.posts.side, entryPx: schema.posts.entryPx, size: schema.posts.size, leverage: schema.posts.leverage, status: schema.posts.status }).from(schema.posts).where(inArray(schema.posts.id, postIds));
  const P = new Map(posts.map((p) => [p.id, p]));
  const hurting: { userId: string; oppId: string; battleHref: string; roi: number; coin: string }[] = [];
  const lows: { id: number; fader: boolean; roi: number }[] = [];
  for (const b of open) {
    for (const [postId, userId, oppId] of [[b.faderPostId, b.faderId, b.targetId], [b.targetPostId, b.targetId, b.faderId]] as const) {
      const p = P.get(postId); if (!p || p.status !== "open") continue;
      const mid = Number(mids[p.coin ?? b.coin] ?? 0); if (!mid) continue;
      const roi = pnlForPosition(p.side as "long" | "short", Number(p.entryPx), mid, Number(p.size)).pct * (p.leverage ?? 1);
      // Remember each fighter's lowest point in the fade (Comeback Kid trophy).
      const meFader = userId === b.faderId, low = meFader ? b.faderLow : b.targetLow;
      if (low == null || roi < Number(low)) lows.push({ id: b.id, fader: meFader, roi });
      if (roi <= BLOODBATH_ROI) hurting.push({ userId, oppId, battleHref: `/battle/${b.faderPostId}`, roi, coin: b.coin });
    }
  }
  for (const l of lows) {
    await (l.fader ? db.update(schema.battles).set({ faderLow: l.roi.toFixed(2) }) : db.update(schema.battles).set({ targetLow: l.roi.toFixed(2) })).where(eq(schema.battles.id, l.id)).catch(() => null);
  }
  if (!hurting.length) return 0;
  const userIds = [...new Set(hurting.flatMap((h) => [h.userId, h.oppId]))];
  const [users, follows] = await Promise.all([
    db.select({ id: schema.users.id, handle: schema.users.handle, isBot: schema.users.isBot }).from(schema.users).where(inArray(schema.users.id, userIds)),
    db.select().from(schema.follows).where(inArray(schema.follows.followeeId, [...new Set(hurting.map((h) => h.userId))])),
  ]);
  const H = new Map(users.map((u) => [u.id, u.handle]));
  const bot = new Set(users.filter((u) => u.isBot).map((u) => u.id));
  let sent = 0;
  // Last stand: the trader who's bleeding gets one nudge per battle to cut it or double down.
  for (const h of hurting) {
    if (bot.has(h.userId)) continue;
    const [done] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
      .where(and(eq(schema.notifications.type, "laststand"), eq(schema.notifications.href, h.battleHref), eq(schema.notifications.userId, h.userId))).limit(1);
    if (done) continue;
    await db.insert(schema.notifications).values({ userId: h.userId, type: "laststand", href: h.battleHref,
      title: `You're getting perped by ${H.get(h.oppId) ?? "your opponent"}`,
      body: `${h.roi.toFixed(0)}% on ${h.coin}. Last stand: cut it, or double down.` });
    await pushTo(h.userId, { title: `You're getting perped by ${H.get(h.oppId) ?? "your opponent"}`, body: `${h.roi.toFixed(0)}% on ${h.coin}. Last stand: cut it, or double down.`, href: h.battleHref, tag: "laststand" });
    sent++;
  }
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
      title: `${who} is getting perped`,
      body: `${who} is ${h.roi.toFixed(0)}% on ${h.coin} against ${opp}. Watch it live.`,
    })));
    await pushTo(todo, { title: `${who} is getting perped`, body: `${who} is ${h.roi.toFixed(0)}% on ${h.coin} against ${opp}. Watch it live.`, href: h.battleHref, tag: "bloodbath" });
    sent += todo.length;
  }
  return sent;
}

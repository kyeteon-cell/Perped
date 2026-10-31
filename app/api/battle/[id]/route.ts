import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/battle/:id → a fade as a head-to-head. `id` is the fader's trade post. Returns both trades, both
 * traders with their stats, and the history between the two (every time either faded the other, who won).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const [fade] = await db.select().from(schema.posts).where(eq(schema.posts.id, Number(id))).limit(1);
  if (!fade || !fade.fadedFromId) return Response.json({ error: "not a fade" }, { status: 404 });
  const [target] = await db.select().from(schema.posts).where(eq(schema.posts.id, fade.fadedFromId)).limit(1);
  if (!target) return Response.json({ error: "not found" }, { status: 404 });

  const who = (uid: string) =>
    db.select({ user: { id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, verified: schema.users.verified, isDemo: schema.users.isDemo, bio: schema.users.bio, xp: schema.users.xp }, stats: schema.stats })
      .from(schema.users).leftJoin(schema.stats, eq(schema.stats.userId, schema.users.id)).where(eq(schema.users.id, uid)).limit(1);
  const [[f], [t]] = await Promise.all([who(fade.userId!), who(target.userId!)]);

  // History: closed fades between the two, either direction. Winner = whoever's trade made money (the sides are opposite).
  const hist = await db
    .select({ id: schema.posts.id, userId: schema.posts.userId, coin: schema.posts.coin, pnl: schema.posts.realizedPnl, closedAt: schema.posts.closedAt, fadedFromId: schema.posts.fadedFromId, side: schema.posts.side, leverage: schema.posts.leverage, entryPx: schema.posts.entryPx, exitPx: schema.posts.exitPx })
    .from(schema.posts)
    .where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed"), isNotNull(schema.posts.fadedFromId),
      or(
        and(eq(schema.posts.userId, fade.userId!), sql`${schema.posts.fadedFromId} in (select id from posts where user_id = ${target.userId})`),
        and(eq(schema.posts.userId, target.userId!), sql`${schema.posts.fadedFromId} in (select id from posts where user_id = ${fade.userId})`),
      )))
    .orderBy(desc(schema.posts.closedAt))
    .limit(20);
  const record = { fader: 0, target: 0 };
  for (const h of hist) { const faderWon = (h.userId === fade.userId) === (Number(h.pnl ?? 0) > 0); if (Number(h.pnl ?? 0) === 0) continue; if (faderWon) record.fader++; else record.target++; }

  // How this target's trade has been received overall
  const [camps] = await db.select({
    copied: sql<number>`count(*) filter (where copied_from_id = ${target.id})`.mapWith(Number),
    faded: sql<number>`count(*) filter (where faded_from_id = ${target.id})`.mapWith(Number),
  }).from(schema.posts).where(sql`copied_from_id = ${target.id} or faded_from_id = ${target.id}`);

  const [battle] = await db.select().from(schema.battles).where(eq(schema.battles.faderPostId, fade.id)).limit(1);
  // Sworn rivals? Then this is a nemesis match.
  const [ua, ub] = fade.userId! < target.userId! ? [fade.userId!, target.userId!] : [target.userId!, fade.userId!];
  const [rv] = await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.userA, ua), eq(schema.rivalries.userB, ub), eq(schema.rivalries.active, true))).limit(1);
  let isNem = !!rv?.calledBy;
  if (rv && !isNem) {
    const tops = await db.select({ u: sql<string>`u`, m: sql<number>`max(f)`.mapWith(Number) }).from(sql`(select user_a as u, fights as f from rivalries where active union all select user_b, fights from rivalries where active) t`).where(sql`u in (${ua}, ${ub})`).groupBy(sql`u`);
    isNem = tops.every((t) => rv.fights >= t.m);
  }
  const fIsA = rv?.userA === fade.userId;
  const nemesis = rv && isNem ? { fights: rv.fights, faderWins: fIsA ? rv.aWins : rv.bWins, targetWins: fIsA ? rv.bWins : rv.aWins, draws: rv.draws, meeting: rv.fights + (battle?.status === "settled" ? 0 : 1) } : null;
  return Response.json({ fade, target, fader: f, targetUser: t, history: hist, record, camps, battle: battle ?? null, nemesis });
}

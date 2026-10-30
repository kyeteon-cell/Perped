import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFillsByTime, summariseFills } from "@/lib/hl-info";

/**
 * GET /api/cron/stats → every 15 min: refresh verified trade stats from Hyperliquid fills, plus
 * call stats, judgement, copied/faded counts and verification status from our tables.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const users = await db.select({ id: schema.users.id, address: schema.users.address, xHandle: schema.users.xHandle }).from(schema.users);
  const now = Date.now();
  const DAY = 86_400_000;
  let updated = 0;

  for (const u of users) {
    try {
      const fills = await getUserFillsByTime(u.address, now - 90 * DAY);
      const all = summariseFills(fills), d30 = summariseFills(fills.filter((f) => f.time >= now - 30 * DAY)), d7 = summariseFills(fills.filter((f) => f.time >= now - 7 * DAY));
      const liquidations = fills.filter((f) => /liquidat/i.test(f.dir)).length;

      const calls = await db.select({ callStatus: schema.posts.callStatus, targetPx: schema.posts.targetPx, resolvedPx: schema.posts.resolvedPx, createdAt: schema.posts.createdAt, side: schema.posts.side })
        .from(schema.posts).where(and(eq(schema.posts.userId, u.id), eq(schema.posts.kind, "call")));
      const resolved = calls.filter((c) => c.callStatus === "hit" || c.callStatus === "missed").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const hits = resolved.filter((c) => c.callStatus === "hit").length;
      let streak = 0;
      for (const c of resolved) { if (c.callStatus === "hit") streak++; else break; }
      const moves = resolved.filter((c) => c.resolvedPx && c.targetPx).map((c) => Math.abs((Number(c.resolvedPx) - Number(c.targetPx)) / Number(c.targetPx)) * 100);
      const avgMove = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;

      // Judgement: of this user's votes on resolved calls, how often were they on the right side?
      const [j] = await db.select({
        total: sql<number>`count(*)`.mapWith(Number),
        right: sql<number>`sum(case when (v.value = 1 and p.call_status = 'hit') or (v.value = -1 and p.call_status = 'missed') then 1 else 0 end)`.mapWith(Number),
      }).from(sql`votes v join posts p on p.id = v.post_id`).where(sql`v.user_id = ${u.id} and p.kind = 'call' and p.call_status in ('hit','missed')`);
      const judgement = j?.total ? (j.right / j.total) * 100 : 0;

      const [cf] = await db.select({
        copied: sql<number>`(select count(*) from posts c join posts s on c.copied_from_id = s.id where s.user_id = ${u.id})`.mapWith(Number),
        faded: sql<number>`(select count(*) from posts c join posts s on c.faded_from_id = s.id where s.user_id = ${u.id})`.mapWith(Number),
      }).from(sql`(select 1) t`);

      const verified = all.closed >= 10 && !!u.xHandle;
      const row = {
        userId: u.id,
        realizedPnl7d: d7.realized.toFixed(4), realizedPnl30d: d30.realized.toFixed(4), realizedPnlAll: all.realized.toFixed(4),
        winRate: all.winRate.toFixed(2), closedTrades: all.closed, volume30d: d30.volume.toFixed(2), liquidations,
        callsResolved: resolved.length, callsHit: hits, callAvgMove: avgMove.toFixed(2), callStreak: streak, judgement: judgement.toFixed(2),
        copiedCount: cf?.copied ?? 0, fadedCount: cf?.faded ?? 0, updatedAt: new Date(),
      };
      await db.insert(schema.stats).values(row).onConflictDoUpdate({ target: schema.stats.userId, set: row });
      await db.update(schema.users).set({ verified }).where(eq(schema.users.id, u.id));
      updated++;
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      /* skip this user this run */
    }
  }
  return Response.json({ users: users.length, updated });
}

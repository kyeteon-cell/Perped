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
  const users = await db.select({ id: schema.users.id, address: schema.users.address, xHandle: schema.users.xHandle, isDemo: schema.users.isDemo }).from(schema.users);
  const now = Date.now();
  const DAY = 86_400_000;
  let updated = 0;

  for (const u of users) {
    try {
      let all, d30, d7, liquidations = 0;
      if (u.isDemo) {
        // Paper trades: summarise from our own closed posts.
        const closed = await db.select({ pnl: schema.posts.realizedPnl, notional: schema.posts.notionalUsd, closedAt: schema.posts.closedAt, meta: schema.posts.meta })
          .from(schema.posts).where(and(eq(schema.posts.userId, u.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed")));
        const sum = (rows: typeof closed) => {
          const r = { realized: 0, volume: 0, wins: 0, losses: 0, closed: rows.length, winRate: 0 };
          for (const c of rows) { const p = Number(c.pnl ?? 0); r.realized += p; r.volume += Number(c.notional ?? 0) * 2; if (p > 0) r.wins++; else if (p < 0) r.losses++; }
          r.winRate = r.closed ? (r.wins / r.closed) * 100 : 0;
          return r;
        };
        all = sum(closed); d30 = sum(closed.filter((c) => (c.closedAt?.getTime() ?? 0) >= now - 30 * DAY)); d7 = sum(closed.filter((c) => (c.closedAt?.getTime() ?? 0) >= now - 7 * DAY));
        liquidations = closed.filter((c) => (c.meta as { closeReason?: string } | null)?.closeReason === "liquidation").length;
      } else {
        const fills = await getUserFillsByTime(u.address, now - 90 * DAY);
        all = summariseFills(fills); d30 = summariseFills(fills.filter((f) => f.time >= now - 30 * DAY)); d7 = summariseFills(fills.filter((f) => f.time >= now - 7 * DAY));
        liquidations = fills.filter((f) => /liquidat/i.test(f.dir)).length;
      }

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

      const verified = !u.isDemo && all.closed >= 10 && !!u.xHandle;
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
  // Rank real traders on 30-day PnL (bots and demo accounts excluded); drives the top fee tier.
  await db.execute(sql`
    with ranked as (
      select s.user_id, row_number() over (order by s.realized_pnl_30d desc, s.closed_trades desc) as rk
      from stats s join users u on u.id = s.user_id
      where u.is_demo = false and u.is_bot = false and s.closed_trades > 0
    )
    update stats set rank_30d = ranked.rk from ranked where stats.user_id = ranked.user_id
  `);
  await db.execute(sql`update stats set rank_30d = null where user_id in (select id from users where is_demo or is_bot) or closed_trades = 0`);
  return Response.json({ users: users.length, updated });
}

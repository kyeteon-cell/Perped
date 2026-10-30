import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

/**
 * GET /api/leaderboard?mode=trades|calls&period=7d|30d|all
 * trades: top 50 by realised PnL + bottom 5 of those who opted in. calls: hit rate, min 5 resolved.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const m = url.searchParams.get("mode");
  const mode = m === "calls" ? "calls" : m === "ranks" ? "ranks" : "trades";
  const demo = url.searchParams.get("demo") === "1";
  const realOnly = eq(schema.users.isDemo, demo);
  const period = url.searchParams.get("period") ?? "7d";
  const base = {
    handle: schema.users.handle,
    avatarUrl: schema.users.avatarUrl,
    winRate: schema.stats.winRate,
    closedTrades: schema.stats.closedTrades,
    volume30d: schema.stats.volume30d,
    liquidations: schema.stats.liquidations,
    fadedCount: schema.stats.fadedCount,
    callsResolved: schema.stats.callsResolved,
    callsHit: schema.stats.callsHit,
    callAvgMove: schema.stats.callAvgMove,
    callStreak: schema.stats.callStreak,
    isDemo: schema.users.isDemo,
    xp: schema.users.xp,
    battlesWon: schema.stats.battlesWon,
    battlesLost: schema.stats.battlesLost,
  };
  if (mode === "ranks") {
    const rows = await db.select(base).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(realOnly).orderBy(desc(schema.users.xp), desc(schema.stats.battlesWon)).limit(50);
    return Response.json({ mode, rows });
  }
  if (mode === "calls") {
    const rows = await db
      .select({ ...base, hitRate: sql<number>`case when ${schema.stats.callsResolved} > 0 then ${schema.stats.callsHit}::numeric / ${schema.stats.callsResolved} * 100 else 0 end`.mapWith(Number) })
      .from(schema.stats)
      .innerJoin(schema.users, eq(schema.users.id, schema.stats.userId))
      .where(and(gte(schema.stats.callsResolved, 5), realOnly))
      .orderBy(desc(sql`${schema.stats.callsHit}::numeric / ${schema.stats.callsResolved}`), desc(schema.stats.callsResolved))
      .limit(50);
    return Response.json({ mode, rows });
  }
  const col = period === "30d" ? schema.stats.realizedPnl30d : period === "all" ? schema.stats.realizedPnlAll : schema.stats.realizedPnl7d;
  const sel = { ...base, pnl: sql<number>`${col}`.mapWith(Number) };
  const [top, bottom] = await Promise.all([
    db.select(sel).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(realOnly).orderBy(desc(col)).limit(50),
    db.select(sel).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(and(eq(schema.users.showBottomBoard, true), realOnly)).orderBy(asc(col)).limit(5),
  ]);
  return Response.json({ mode, period, rows: top, bottom: bottom.filter((b) => b.pnl < 0) });
}

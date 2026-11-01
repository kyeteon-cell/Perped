import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

/**
 * GET /api/leaderboard?mode=trades|calls&period=7d|30d|all
 * trades: top 50 by realised PnL + bottom 5 of those who opted in. calls: hit rate, min 5 resolved.
 */
export const dynamic = "force-dynamic";
/** The board is the same for everyone: cache it at the edge for 30s, serve stale up to 2 min while refreshing. */
const CACHE = { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" };

export async function GET(req: Request) {
  try {
    const first = await board(req);
    // Nothing real on the board yet → show demo accounts so the page is never empty, and say so.
    if (first.rows.length === 0 && !first.demo) {
      const alt = await board(req, true);
      return Response.json({ ...alt, fellBack: true }, { headers: CACHE });
    }
    return Response.json(first, { headers: CACHE });
  } catch (e) {
    return Response.json({ rows: [], error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function board(req: Request, forceDemo = false): Promise<{ mode: string; demo: boolean; period?: string; rows: unknown[]; bottom?: unknown[] }> {
  await ensureSchema();
  const url = new URL(req.url);
  const m = url.searchParams.get("mode");
  const mode = m === "calls" ? "calls" : m === "ranks" ? "ranks" : m === "season" ? "season" : "trades";
  const demo = forceDemo || url.searchParams.get("demo") === "1";
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
    role: schema.users.role,
    founderSeat: schema.users.founderSeat,
    founderStatus: schema.users.founderStatus,
    battlesWon: schema.stats.battlesWon,
    battlesLost: schema.stats.battlesLost,
  };
  if (mode === "season") {
    // Season = calendar month (UTC). Ranked by XP earned this month; the seed grant doesn't count.
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const seasonXp = sql<number>`(select coalesce(sum(x.delta), 0) from xp_log x where x.user_id = ${schema.users.id} and x.created_at >= ${start.toISOString()} and x.reason <> 'season_start')`.mapWith(Number);
    const rows = await db.select({ ...base, seasonXp }).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId))
      .where(and(realOnly, sql`exists (select 1 from xp_log x where x.user_id = ${schema.users.id} and x.created_at >= ${start.toISOString()} and x.reason <> 'season_start')`))
      .orderBy(desc(seasonXp)).limit(50);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { mode, demo, rows, season: { name: start.toLocaleString("en", { month: "long", timeZone: "UTC" }), endsAt: end.toISOString() } } as { mode: string; demo: boolean; rows: unknown[] };
  }
  if (mode === "ranks") {
    const rows = await db.select(base).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(realOnly).orderBy(desc(schema.users.xp), desc(schema.stats.battlesWon)).limit(50);
    return { mode, demo, rows };
  }
  if (mode === "calls") {
    const rows = await db
      .select({ ...base, hitRate: sql<number>`case when ${schema.stats.callsResolved} > 0 then ${schema.stats.callsHit}::numeric / ${schema.stats.callsResolved} * 100 else 0 end`.mapWith(Number) })
      .from(schema.stats)
      .innerJoin(schema.users, eq(schema.users.id, schema.stats.userId))
      .where(and(gte(schema.stats.callsResolved, 5), realOnly))
      .orderBy(desc(sql`${schema.stats.callsHit}::numeric / ${schema.stats.callsResolved}`), desc(schema.stats.callsResolved))
      .limit(50);
    return { mode, demo, rows };
  }
  const col = period === "30d" ? schema.stats.realizedPnl30d : period === "all" ? schema.stats.realizedPnlAll : schema.stats.realizedPnl7d;
  const sel = { ...base, pnl: sql<number>`${col}`.mapWith(Number) };
  const [top, bottom] = await Promise.all([
    db.select(sel).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(realOnly).orderBy(desc(col)).limit(50),
    db.select(sel).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(and(eq(schema.users.showBottomBoard, true), realOnly)).orderBy(asc(col)).limit(5),
  ]);
  return { mode, demo, period, rows: top, bottom: bottom.filter((b) => b.pnl < 0) };
}

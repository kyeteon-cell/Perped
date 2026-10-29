import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** GET /api/leaderboard?period=7d|30d|all → top traders by realised PnL (from chain fills). */
export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period") ?? "7d";
  const col = period === "30d" ? schema.stats.realizedPnl30d : period === "all" ? schema.stats.realizedPnlAll : schema.stats.realizedPnl7d;
  const rows = await db
    .select({
      handle: schema.users.handle,
      avatarUrl: schema.users.avatarUrl,
      pnl: sql<number>`${col}`.mapWith(Number),
      winRate: schema.stats.winRate,
      closedTrades: schema.stats.closedTrades,
      volume30d: schema.stats.volume30d,
      updatedAt: schema.stats.updatedAt,
    })
    .from(schema.stats)
    .innerJoin(schema.users, eq(schema.users.id, schema.stats.userId))
    .orderBy(desc(col))
    .limit(50);
  return Response.json({ period, rows });
}

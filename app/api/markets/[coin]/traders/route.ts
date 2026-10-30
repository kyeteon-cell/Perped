import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type MarketTrader = {
  postId: number; handle: string; avatarUrl: string | null; isDemo: boolean; verified: boolean;
  side: "long" | "short"; leverage: number; entryPx: number; size: number; notionalUsd: number;
  openedAt: string; status: "open" | "closed"; exitPx: number | null; closedAt: string | null;
  fadeCount: number; copyCount: number; fadedFromId: number | null;
  following: boolean; top: boolean; mine: boolean;
};

/**
 * GET /api/markets/:coin/traders → Perped trades on this market for the chart overlay and tape:
 * open positions plus trades closed in the last 24h, flagged by whether the viewer follows the trader,
 * whether the trader is top-10 on the 30-day board, and how contested the trade is (fades).
 */
export async function GET(req: Request, ctx: { params: Promise<{ coin: string }> }) {
  await ensureSchema();
  const { coin } = await ctx.params;
  const auth = await getAuth(req).catch(() => null);
  const since = new Date(Date.now() - 24 * 3_600_000);

  const rows = await db
    .select({
      p: schema.posts,
      u: { id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, isDemo: schema.users.isDemo, verified: schema.users.verified },
      rank: schema.stats.rank30d, pnl30: schema.stats.realizedPnl30d,
      fadeCount: sql<number>`(select count(*) from posts f where f.faded_from_id = ${schema.posts.id})`.mapWith(Number),
      copyCount: sql<number>`(select count(*) from posts c where c.copied_from_id = ${schema.posts.id})`.mapWith(Number),
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .leftJoin(schema.stats, eq(schema.stats.userId, schema.users.id))
    .where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.coin, coin.toUpperCase()), or(eq(schema.posts.status, "open"), gte(schema.posts.closedAt, since))))
    .orderBy(desc(schema.posts.createdAt))
    .limit(80);

  // Who the viewer follows
  let followed = new Set<string>();
  if (auth) {
    const f = await db.select({ id: schema.follows.followeeId }).from(schema.follows).where(eq(schema.follows.followerId, auth.privyId));
    followed = new Set(f.map((x) => x.id));
  }
  // Top 10: ranked real traders first; if nobody is ranked yet (demo-only world), top 10 by 30d PnL overall.
  const ranked = await db.select({ id: schema.stats.userId }).from(schema.stats).where(and(sql`${schema.stats.rank30d} is not null`, sql`${schema.stats.rank30d} <= 10`));
  let top = new Set(ranked.map((r) => r.id));
  if (!top.size) {
    const t = await db.select({ id: schema.stats.userId }).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(sql`${schema.stats.closedTrades} > 0`).orderBy(desc(schema.stats.realizedPnl30d)).limit(10);
    top = new Set(t.map((r) => r.id));
  }

  const traders: MarketTrader[] = rows.map(({ p, u, fadeCount, copyCount }) => ({
    postId: p.id, handle: u.handle, avatarUrl: u.avatarUrl, isDemo: u.isDemo || p.paper, verified: u.verified,
    side: p.side as "long" | "short", leverage: p.leverage ?? 1, entryPx: Number(p.entryPx), size: Number(p.size), notionalUsd: Number(p.notionalUsd ?? 0),
    openedAt: p.createdAt.toISOString(), status: p.status, exitPx: p.exitPx ? Number(p.exitPx) : null, closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    fadeCount, copyCount, fadedFromId: p.fadedFromId,
    following: followed.has(u.id), top: top.has(u.id), mine: auth?.privyId === u.id,
  }));
  return Response.json({ coin: coin.toUpperCase(), traders, followingAny: followed.size > 0 });
}

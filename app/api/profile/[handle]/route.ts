import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { getClearinghouseState } from "@/lib/hl-info";

/** GET /api/profile/:handle → profile, stats, follow counts, whether the viewer follows, live positions + account value. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  await ensureSchema();
  const { handle } = await ctx.params;
  const auth = await getAuth(req).catch(() => null);
  const [row] = await db
    .select({
      user: schema.users,
      stats: schema.stats,
      followers: sql<number>`(select count(*) from follows f where f.followee_id = ${schema.users.id})`.mapWith(Number),
      following: sql<number>`(select count(*) from follows f where f.follower_id = ${schema.users.id})`.mapWith(Number),
      rivalries: sql<unknown>`(select coalesce(json_agg(json_build_object('opponent', u2.handle, 'wins', r.wins, 'losses', r.losses)), '[]') from (
        select case when d.challenger_id = ${schema.users.id} then d.opponent_id else d.challenger_id end as opp,
               sum(case when d.winner_id = ${schema.users.id} then 1 else 0 end) as wins,
               sum(case when d.winner_id is not null and d.winner_id <> ${schema.users.id} then 1 else 0 end) as losses
        from duels d where d.status = 'settled' and (d.challenger_id = ${schema.users.id} or d.opponent_id = ${schema.users.id}) group by opp) r join users u2 on u2.id = r.opp)`,
    })
    .from(schema.users)
    .leftJoin(schema.stats, eq(schema.stats.userId, schema.users.id))
    .where(eq(schema.users.handle, handle.toLowerCase()))
    .limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  let isFollowing = false;
  if (auth) {
    const [f] = await db.select().from(schema.follows).where(and(eq(schema.follows.followerId, auth.privyId), eq(schema.follows.followeeId, row.user.id))).limit(1);
    isFollowing = !!f;
  }
  // Settings are private: strip them unless it's the viewer's own profile.
  const isMe = auth?.privyId === row.user.id;
  const user = isMe ? row.user : { ...row.user, showLiquidations: undefined, showSizes: undefined, allowCopy: row.user.allowCopy, allowFade: row.user.allowFade, showBottomBoard: undefined, acceptDuels: row.user.acceptDuels, defaultLeverage: undefined, pnlDisplay: undefined, xHandle: row.user.xHandle };

  let positions: unknown[] = [];
  let accountValue: number | null = null;
  let withdrawable: number | null = null;
  try {
    const state = await getClearinghouseState(row.user.address);
    positions = state.assetPositions.map((p) => p.position).filter((p) => Number(p.szi) !== 0);
    accountValue = Number(state.marginSummary.accountValue);
    withdrawable = Number(state.withdrawable);
  } catch {
    /* Hyperliquid unreachable */
  }
  const xpRecent = await db.select({ delta: schema.xpLog.delta, reason: schema.xpLog.reason, ref: schema.xpLog.ref, createdAt: schema.xpLog.createdAt }).from(schema.xpLog).where(eq(schema.xpLog.userId, user.id)).orderBy(desc(schema.xpLog.createdAt)).limit(8);
  return Response.json({ user, stats: row.stats, followers: row.followers, following: row.following, rivalries: row.rivalries, isFollowing, isMe, positions, accountValue, withdrawable, xpRecent });
}

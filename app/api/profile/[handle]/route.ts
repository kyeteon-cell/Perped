import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getClearinghouseState } from "@/lib/hl-info";

/** GET /api/profile/:handle → profile, cached stats, live open positions from Hyperliquid. */
export async function GET(_req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const [row] = await db
    .select({
      user: schema.users,
      stats: schema.stats,
      followers: sql<number>`(select count(*) from follows f where f.followee_id = ${schema.users.id})`.mapWith(Number),
      following: sql<number>`(select count(*) from follows f where f.follower_id = ${schema.users.id})`.mapWith(Number),
    })
    .from(schema.users)
    .leftJoin(schema.stats, eq(schema.stats.userId, schema.users.id))
    .where(eq(schema.users.handle, handle.toLowerCase()))
    .limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  let positions: unknown[] = [];
  let accountValue: number | null = null;
  try {
    const state = await getClearinghouseState(row.user.address);
    positions = state.assetPositions.map((p) => p.position).filter((p) => Number(p.szi) !== 0);
    accountValue = Number(state.marginSummary.accountValue);
  } catch {
    /* Hyperliquid unreachable: show profile without live data */
  }

  return Response.json({ ...row, positions, accountValue });
}

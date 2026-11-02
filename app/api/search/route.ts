import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/**
 * GET /api/search?q=ka → traders matching a handle: exact first, then starts-with, then contains, by XP.
 * Coins are searched on the client from the markets list it already has.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  if (!q) return Response.json({ users: [] });
  const like = `%${q.replace(/_/g, "\\_")}%`, pre = `${q.replace(/_/g, "\\_")}%`;
  const r = rows(await db.execute(sql`
    select u.handle, u.avatar_url as "avatarUrl", u.xp, u.role, u.founder_seat as "founderSeat", u.founder_status as "founderStatus", u.verified, u.is_bot as "isBot",
      coalesce(s.closed_trades, 0)::int as "closedTrades", coalesce(s.win_rate, 0)::float as "winRate",
      coalesce(s.battles_won, 0)::int as "battlesWon", coalesce(s.battles_lost, 0)::int as "battlesLost"
    from users u left join stats s on s.user_id = u.id
    where u.handle ilike ${like}
    order by (u.handle = ${q}) desc, (u.handle ilike ${pre}) desc, u.xp desc nulls last
    limit 20`));
  return Response.json({ users: r }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } });
}

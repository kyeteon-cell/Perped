import { db, schema } from "@/lib/db";
import { getUserFillsByTime, summariseFills } from "@/lib/hl-info";

/**
 * GET /api/cron/stats → refresh every user's verified stats from Hyperliquid fills.
 * Protect with CRON_SECRET (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = await db.select({ id: schema.users.id, address: schema.users.address }).from(schema.users);
  const now = Date.now();
  const DAY = 86_400_000;
  let updated = 0;
  for (const u of users) {
    try {
      const fills = await getUserFillsByTime(u.address, now - 90 * DAY); // Hyperliquid returns up to 2000 fills
      const all = summariseFills(fills);
      const d30 = summariseFills(fills.filter((f) => f.time >= now - 30 * DAY));
      const d7 = summariseFills(fills.filter((f) => f.time >= now - 7 * DAY));
      await db
        .insert(schema.stats)
        .values({
          userId: u.id,
          realizedPnl7d: d7.realized.toFixed(4),
          realizedPnl30d: d30.realized.toFixed(4),
          realizedPnlAll: all.realized.toFixed(4),
          winRate: all.winRate.toFixed(2),
          closedTrades: all.closed,
          volume30d: d30.volume.toFixed(2),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.stats.userId,
          set: {
            realizedPnl7d: d7.realized.toFixed(4),
            realizedPnl30d: d30.realized.toFixed(4),
            realizedPnlAll: all.realized.toFixed(4),
            winRate: all.winRate.toFixed(2),
            closedTrades: all.closed,
            volume30d: d30.volume.toFixed(2),
            updatedAt: new Date(),
          },
        });
      updated++;
      await new Promise((r) => setTimeout(r, 150)); // be gentle with the info endpoint
    } catch {
      /* skip this user this run */
    }
  }
  return Response.json({ users: users.length, updated });
}

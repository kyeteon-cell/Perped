import { botTick, ensureBots, seedHistory } from "@/lib/bots";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getMarkets, getCandles } from "@/lib/hl-info";
import { systemPost } from "@/lib/feed";

/** GET /api/cron/bots → one tick of demo-trader activity. Every 15 min via Vercel cron. Set BOTS_PAUSED=1 to stop. */
export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && new URL(req.url).searchParams.get("key") !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.BOTS_PAUSED === "1") return Response.json({ ok: true, paused: true });
  // First run on a fresh database: create the demo traders and backfill two weeks of activity.
  const [any] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isBot, true)).limit(1);
  if (!any) {
    await ensureBots();
    const posts = await seedHistory();
    return Response.json({ ok: true, seeded: true, posts });
  }
  const log = await botTick();
  const stories = await marketStories().catch(() => 0);
  return Response.json({ ok: true, actions: log, stories });
}

/**
 * "X is moving" story cards: for the top markets by volume, post when the last hour moved more than 3%
 * and we haven't posted a story on that coin in the last 6 hours.
 */
async function marketStories() {
  const markets = (await getMarkets()).sort((a, b) => b.volume24h - a.volume24h).slice(0, 12);
  const since = new Date(Date.now() - 6 * 3_600_000);
  let posted = 0;
  for (const m of markets) {
    const candles = await getCandles(m.name, "1h", Date.now() - 2 * 3_600_000);
    const first = candles[0]?.o, last = candles[candles.length - 1]?.c;
    if (!first || !last) continue;
    const pct = ((last - first) / first) * 100;
    if (Math.abs(pct) < 3) continue;
    const [dup] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.kind, "system"), eq(schema.posts.systemType, "story"), eq(schema.posts.coin, m.name), gte(schema.posts.createdAt, since))).limit(1);
    if (dup) continue;
    const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.posts).where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), eq(schema.posts.coin, m.name)));
    await systemPost("story", `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% in the last hour · ${n?.n ?? 0} Perped traders in it`, { pct, traders: n?.n ?? 0 }, m.name);
    posted++;
  }
  return posted;
}

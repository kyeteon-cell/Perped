import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/moments?after=<id> → the big moments worth a full-screen celebration: rank ups, trophies,
 * fades won and duels won. The app remembers the last id it showed, so nothing replays.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const after = Math.max(0, Number(new URL(req.url).searchParams.get("after") ?? 0) || 0);
  const list = await db.select({ id: schema.notifications.id, type: schema.notifications.type, title: schema.notifications.title, body: schema.notifications.body, href: schema.notifications.href, createdAt: schema.notifications.createdAt })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, auth.privyId), gt(schema.notifications.id, after), inArray(schema.notifications.type, ["rank", "achievement", "battle", "duel"])))
    .orderBy(desc(schema.notifications.id)).limit(10);
  const [top] = after ? [] : await db.select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.userId, auth.privyId)).orderBy(desc(schema.notifications.id)).limit(1);
  const moments = list.filter((m) => m.type === "rank" ? m.title.startsWith("Ranked up") : m.type === "battle" ? m.title.startsWith("You won the fade") : m.type === "duel" ? m.title.startsWith("You won") : true);
  // Demo to real: your latest winning demo trade (closed in the last 3 hours), so the app can show what it
  // would have paid with real money. Same size, same price, so the dollar figure is exactly what you'd have banked.
  const afterTrade = Math.max(0, Number(new URL(req.url).searchParams.get("afterTrade") ?? 0) || 0);
  const [demoWin] = await db.select({ id: schema.posts.id, coin: schema.posts.coin, side: schema.posts.side, leverage: schema.posts.leverage, pnl: schema.posts.realizedPnl, size: schema.posts.size, entryPx: schema.posts.entryPx })
    .from(schema.posts)
    .where(and(eq(schema.posts.userId, auth.privyId), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed"), eq(schema.posts.paper, true), gt(schema.posts.id, afterTrade),
      sql`${schema.posts.realizedPnl}::numeric > 0.5`, sql`${schema.posts.closedAt} > now() - interval '3 hours'`))
    .orderBy(desc(schema.posts.closedAt)).limit(1);
  return Response.json({ moments, latest: list[0]?.id ?? top?.id ?? after, demoWin: demoWin ? { ...demoWin, pnl: Number(demoWin.pnl) } : null }, { headers: { "cache-control": "private, no-store" } });
}

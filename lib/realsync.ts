import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { getClearinghouseState } from "./hl-info";
import { closingFills } from "./hlfills";
import { closeTradePost } from "./trades";

/**
 * Cron: real-money posts still open on Perped whose position is gone on Hyperliquid (closed there by a trigger
 * order, a liquidation, or the Hyperliquid UI). Close them at the real exit so battles can settle.
 */
export async function syncRealPositions(maxUsers = 25) {
  const open = await db.select({ id: schema.posts.id, userId: schema.posts.userId, coin: schema.posts.coin, side: schema.posts.side, createdAt: schema.posts.createdAt })
    .from(schema.posts)
    .where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), eq(schema.posts.paper, false)))
    .limit(300);
  if (!open.length) return 0;
  const userIds = [...new Set(open.map((p) => p.userId).filter(Boolean) as string[])].slice(0, maxUsers);
  const users = await db.select({ id: schema.users.id, address: schema.users.address, isDemo: schema.users.isDemo }).from(schema.users).where(inArray(schema.users.id, userIds));
  let closed = 0;
  for (const u of users) {
    // Demo or not, anyone with an open real post still has a real position to keep in sync.
    if (!u.address || !/^0x[0-9a-f]{40}$/i.test(u.address)) continue;
    const state = await getClearinghouseState(u.address).catch(() => null);
    if (!state) continue;
    const pos = new Map(state.assetPositions.map((a) => [a.position.coin, Number(a.position.szi)]));
    for (const p of open.filter((x) => x.userId === u.id)) {
      const szi = pos.get(p.coin!) ?? 0;
      const stillOpen = p.side === "long" ? szi > 0 : szi < 0;
      if (stillOpen) continue;
      const exit = await closingFills(u.address, p.coin!, new Date(p.createdAt).getTime()).catch(() => null);
      if (!exit) continue; // no close found yet; try again next run
      await closeTradePost(p.id, u.id, { exitPx: exit.px, reason: exit.liquidated ? "liquidation" : "manual", trusted: true }).catch(() => null);
      closed++;
    }
  }
  return closed;
}

import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { getCandles, getMids } from "./hl-info";
import { demoLiqPx } from "./format";
import { closeTradePost } from "./trades";

type Reason = "tp" | "sl" | "liquidation";
type Post = typeof schema.posts.$inferSelect;

/** How far back to look for a wick. The cron runs every 5 min; 20 min of overlap covers a missed run or two. */
const LOOKBACK_MS = 20 * 60_000;
const MIN = 60_000;

/**
 * Where a demo trade's stop, target or liquidation was hit, if anywhere.
 * Walks the 1-minute candles after entry, so a wick that touched the stop and bounced still counts,
 * then checks the live mid for the minute that hasn't closed yet. Fills at the trigger price like a
 * resting stop order would, or at the candle's open if price gapped straight through it.
 * If a stop and a target are both inside the same candle we can't tell which came first: the stop wins.
 */
export function findTrigger(t: Pick<Post, "side" | "entryPx" | "leverage" | "slPx" | "tpPx" | "createdAt">, candles: { t: number; o: number; h: number; l: number }[], mid: number): { reason: Reason; px: number } | null {
  const up = t.side === "long", entry = Number(t.entryPx), lev = t.leverage ?? 1;
  const liq = lev > 1 ? demoLiqPx(up ? "long" : "short", entry, lev) : 0;
  const sl = t.slPx ? Number(t.slPx) : 0, tp = t.tpPx ? Number(t.tpPx) : 0;
  // Losing-side levels, nearest first: a stop sits inside liquidation, so it's hit first.
  const losing: { reason: Reason; lvl: number }[] = [];
  if (sl > 0) losing.push({ reason: "sl", lvl: sl });
  if (liq > 0) losing.push({ reason: "liquidation", lvl: liq });
  losing.sort((a, b) => (up ? b.lvl - a.lvl : a.lvl - b.lvl));

  const check = (o: number, h: number, l: number): { reason: Reason; px: number } | null => {
    for (const { reason, lvl } of losing) {
      if (up ? l <= lvl : h >= lvl) {
        if (reason === "liquidation") return { reason, px: lvl };
        const gapped = up ? o < lvl : o > lvl;
        return { reason, px: gapped ? o : lvl };
      }
    }
    if (tp > 0 && (up ? h >= tp : l <= tp)) {
      const gapped = up ? o > tp : o < tp;
      return { reason: "tp", px: gapped ? o : tp };
    }
    return null;
  };

  // The candle the trade opened in may have printed its high/low before entry, so start at the next one.
  const from = Math.floor(new Date(t.createdAt).getTime() / MIN) * MIN + MIN;
  for (const c of candles) {
    if (c.t < from) continue;
    const hit = check(c.o, c.h, c.l);
    if (hit) return hit;
  }
  if (mid > 0) return check(mid, mid, mid);
  return null;
}

/**
 * Enforce take-profit, stop-loss and liquidation on people's open demo trades (bots manage their own).
 * Pass a userId to check just that person's trades (the app calls this when it sees a level crossed).
 */
export async function enforceDemoStops(userId?: string): Promise<number> {
  const conds = [eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), eq(schema.posts.paper, true), eq(schema.users.isBot, false)];
  if (userId) conds.push(eq(schema.posts.userId, userId));
  const open = await db.select({ p: schema.posts }).from(schema.posts).innerJoin(schema.users, eq(schema.users.id, schema.posts.userId)).where(and(...conds));
  if (!open.length) return 0;
  const mids = await getMids().catch(() => ({} as Record<string, string>));
  const now = Date.now();

  // One candle fetch per coin covers every trade on it.
  const byCoin = new Map<string, Post[]>();
  for (const { p } of open) if (p.coin && p.userId) byCoin.set(p.coin, [...(byCoin.get(p.coin) ?? []), p]);
  let closed = 0;
  await Promise.all([...byCoin.entries()].map(async ([coin, trades]) => {
    const oldest = Math.min(...trades.map((t) => new Date(t.createdAt).getTime()));
    const start = Math.max(oldest, now - LOOKBACK_MS);
    const candles = await getCandles(coin, "1m", start, now).catch(() => []);
    const mid = Number(mids[coin] ?? 0);
    for (const t of trades) {
      const hit = findTrigger(t, candles, mid);
      if (!hit) continue;
      const r = await closeTradePost(t.id, t.userId!, { exitPx: hit.px, reason: hit.reason, trusted: true }).catch(() => null);
      if (r && "post" in r) closed++;
    }
  }));
  return closed;
}

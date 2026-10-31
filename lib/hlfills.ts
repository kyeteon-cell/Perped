import { getUserFillsByTime, type Fill } from "./hl-info";

/** Volume-weighted price and total size of a set of fills. */
export function vwap(fills: Fill[]) {
  let sz = 0, notional = 0;
  for (const f of fills) { const s = Number(f.sz), p = Number(f.px); sz += s; notional += s * p; }
  return sz > 0 ? { px: notional / sz, sz } : null;
}

/** The fills of one order on Hyperliquid, looked up by order id (last 15 minutes). */
export async function fillsForOrder(address: string, oid: number, coin: string) {
  const fills = await getUserFillsByTime(address, Date.now() - 15 * 60_000);
  return fills.filter((f) => f.oid === oid && f.coin === coin);
}

/** The most recent closing fills for a coin since a time: what a position actually closed at on Hyperliquid. */
export async function closingFills(address: string, coin: string, since: number) {
  const fills = await getUserFillsByTime(address, since);
  const closes = fills.filter((f) => f.coin === coin && /close|liquidat/i.test(f.dir)).sort((a, b) => b.time - a.time);
  if (!closes.length) return null;
  // The last close and everything within 60s before it (one market close can fill in several pieces).
  const last = closes[0].time;
  const batch = closes.filter((f) => last - f.time < 60_000);
  const v = vwap(batch);
  return v ? { ...v, liquidated: batch.some((f) => /liquidat/i.test(f.dir)), at: last } : null;
}

import type { Candle } from "./hl-info";

/**
 * Fold the live price (updated every second from the price feed) into the candles fetched from the API,
 * so the newest candle forms in real time instead of jumping once a minute. If the newest candle's period
 * has ended, a new one opens at the live price.
 */
export function withLive(candles: Candle[], live: number, ms: number, now = Date.now()): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || !(live > 0)) return candles;
  if (now >= last.t + ms) {
    const t = last.t + Math.floor((now - last.t) / ms) * ms;
    return [...candles, { ...last, t, o: last.c, h: Math.max(last.c, live), l: Math.min(last.c, live), c: live, v: 0 } as Candle];
  }
  return [...candles.slice(0, -1), { ...last, h: Math.max(last.h, live), l: Math.min(last.l, live), c: live }];
}

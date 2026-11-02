// Market metrics for the coin page, all from Hyperliquid's public info API (no estimates).
// Pure maths is exported separately so it can be unit tested.
import { info, memo, getCandles, getMarkets } from "./hl-info";

export type Lvl = { px: number; sz: number };
export type Book = { bids: Lvl[]; asks: Lvl[] };

/** Dollars resting within ±pct of mid. `full` is false when the levels we have don't reach the band edge. */
export function depthWithin(b: Book, mid: number, pct: number) {
  const lo = mid * (1 - pct / 100), hi = mid * (1 + pct / 100);
  let bids = 0, asks = 0;
  for (const l of b.bids) if (l.px >= lo) bids += l.px * l.sz;
  for (const l of b.asks) if (l.px <= hi) asks += l.px * l.sz;
  const full = (b.bids.at(-1)?.px ?? Infinity) < lo && (b.asks.at(-1)?.px ?? 0) > hi;
  return { bids, asks, full };
}

/** Average fill vs mid for a market order of `usd`, in percent (always ≥ 0). null when the book shown is too thin. */
export function slippage(levels: Lvl[], mid: number, usd: number, side: "buy" | "sell") {
  let left = usd, qty = 0, spent = 0;
  for (const l of levels) {
    const val = l.px * l.sz;
    const take = Math.min(left, val);
    qty += take / l.px; spent += take; left -= take;
    if (left <= 1e-9) break;
  }
  if (left > 1e-9 || qty === 0) return null;
  const vwap = spent / qty;
  return side === "buy" ? ((vwap - mid) / mid) * 100 : ((mid - vwap) / mid) * 100;
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Hyperliquid liquidation distance (isolated, ignoring fees/funding): initial margin minus maintenance (half the max-leverage margin). */
export function liqDistancePct(lev: number, maxLev: number) {
  return Math.max(0, (1 / lev - 1 / (2 * maxLev)) * 100);
}

/** Typical day from completed daily candles: median high-to-low range, and median move up / down from the open. */
export function typicalDay(days: { o: number; h: number; l: number }[]) {
  const ok = days.filter((d) => d.o > 0);
  return {
    rangePct: median(ok.map((d) => ((d.h - d.l) / d.o) * 100)),
    upPct: median(ok.map((d) => ((d.h - d.o) / d.o) * 100)),
    downPct: median(ok.map((d) => ((d.o - d.l) / d.o) * 100)),
    days: ok.length,
  };
}

type RawBook = { levels: [{ px: string; sz: string }[], { px: string; sz: string }[]] };
const toBook = (r: RawBook): Book => ({
  bids: (r.levels?.[0] ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz) })),
  asks: (r.levels?.[1] ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz) })),
});
/** Hyperliquid returns 20 levels a side; fewer significant figures = wider buckets that reach further. */
function book(coin: string, nSigFigs?: number) {
  return memo(`bk:${coin}:${nSigFigs ?? 0}`, 2_500, async () => toBook(await info<RawBook>(nSigFigs ? { type: "l2Book", coin, nSigFigs } : { type: "l2Book", coin })));
}

const VENUE: Record<string, { name: string; hours: number }> = { HlPerp: { name: "Hyperliquid", hours: 1 }, BinPerp: { name: "Binance", hours: 8 }, BybitPerp: { name: "Bybit", hours: 8 } };
type Predicted = [string, [string, { fundingRate: string; nextFundingTime?: number; fundingIntervalHours?: number } | null][]][];

export type BookStats = {
  mid: number; spread: number; spreadPct: number;
  depth: { pct: number; bids: number; asks: number; full: boolean; exact: boolean; sig: number | null }[];
  slip: { usd: number; buy: number | null; sell: number | null }[];
  /** The book that reaches ±2%, for the depth picture. */
  levels: Book;
  at: number;
};

/** Live order book stats. Uses the finest book that reaches each band, so numbers are exact wherever possible. */
export async function bookStats(coin: string): Promise<BookStats> {
  const fine = await book(coin);
  const bb = fine.bids[0]?.px ?? 0, ba = fine.asks[0]?.px ?? 0;
  const mid = bb && ba ? (bb + ba) / 2 : bb || ba;
  const ladders: Book[] = [fine];
  const sigOf = new Map<Book, number | null>([[fine, null]]);
  const sigs = [4, 3, 2];
  let next = 0;
  const reach = async (ok: (b: Book) => boolean) => {
    for (const b of ladders) if (ok(b)) return b;
    while (next < sigs.length) {
      const b = await book(coin, sigs[next++]).catch(() => null);
      if (!b) continue;
      ladders.push(b); sigOf.set(b, sigs[next - 1]);
      if (ok(b)) return b;
    }
    return ladders[ladders.length - 1];
  };
  const depth = [];
  let wide = fine;
  for (const pct of [0.5, 2]) {
    const b = await reach((x) => depthWithin(x, mid, pct).full);
    depth.push({ pct, ...depthWithin(b, mid, pct), exact: b === fine, sig: sigOf.get(b) ?? null });
    if (pct === 2) wide = b;
  }
  const slip = [];
  for (const usd of [1_000, 10_000, 100_000]) {
    const bBuy = await reach((x) => slippage(x.asks, mid, usd, "buy") != null);
    const bSell = await reach((x) => slippage(x.bids, mid, usd, "sell") != null);
    slip.push({ usd, buy: slippage(bBuy.asks, mid, usd, "buy"), sell: slippage(bSell.bids, mid, usd, "sell") });
  }
  return { mid, spread: ba - bb, spreadPct: mid ? ((ba - bb) / mid) * 100 : 0, depth, slip, levels: wide, at: Date.now() };
}

export type CoinStats = {
  funding: { now8h: number; apr: number; venues: { venue: string; rate8h: number }[]; history: { t: number; rate8h: number }[]; peak: { t: number; rate8h: number } | null };
  premiumPct: number; oracle: number; maxLev: number;
  typical: ReturnType<typeof typicalDay> & { open: number; high: number; low: number };
  liq: { lev: number; distPct: number };
};

/** Slower-moving stats (funding, premium, typical day). Cached a minute per coin. */
export function coinStats(coin: string): Promise<CoinStats> {
  return memo(`cs:${coin}`, 60_000, async () => {
    const day = 86_400_000, now = Date.now();
    const [markets, predicted, hist, daily] = await Promise.all([
      getMarkets(),
      memo("predfund", 60_000, () => info<Predicted>({ type: "predictedFundings" })).catch(() => [] as Predicted),
      info<{ fundingRate: string; time: number }[]>({ type: "fundingHistory", coin, startTime: now - 7 * day }).catch(() => []),
      getCandles(coin, "1d", now - 31 * day).catch(() => []),
    ]);
    const m = markets.find((x) => x.name === coin);
    if (!m) throw new Error("unknown coin");
    const venues = (predicted.find((p) => p[0] === coin)?.[1] ?? [])
      .filter((v) => v[1] && VENUE[v[0]] && v[0] !== "HlPerp")
      .map(([k, v]) => ({ venue: VENUE[k].name, rate8h: (Number(v!.fundingRate) / (v!.fundingIntervalHours ?? VENUE[k].hours)) * 8 * 100 }));
    // Hourly history → 4-hour averages (42 bars for 7 days).
    const buckets = new Map<number, number[]>();
    for (const h of hist) { const k = Math.floor(h.time / 14_400_000) * 14_400_000; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(Number(h.fundingRate) * 100 * 8); }
    const history = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, xs]) => ({ t, rate8h: xs.reduce((a, b) => a + b, 0) / xs.length }));
    let peak: { t: number; rate8h: number } | null = null;
    for (const h of hist) { const r = Number(h.fundingRate) * 100 * 8; if (!peak || Math.abs(r) > Math.abs(peak.rate8h)) peak = { t: h.time, rate8h: r }; }
    const done = daily.filter((c) => c.t + day <= now), today = daily.find((c) => c.t + day > now);
    const td = typicalDay(done.slice(-30));
    const open = today?.o ?? m.mark;
    const lev = Math.min(10, m.maxLeverage);
    return {
      funding: { now8h: m.funding8h, apr: m.funding8h * 3 * 365, venues, history, peak },
      premiumPct: m.premiumPct, oracle: m.oracle, maxLev: m.maxLeverage,
      typical: { ...td, open, high: open * (1 + td.upPct / 100), low: open * (1 - td.downPct / 100) },
      liq: { lev, distPct: liqDistancePct(lev, m.maxLeverage) },
    };
  });
}

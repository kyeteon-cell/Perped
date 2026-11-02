// Plain-English verdicts for the coin page, built from live numbers with fixed rules (client-safe, no imports).

export type FundingVerdict = "Shorts crowded" | "Shorts pay" | "Normal" | "Above normal" | "Longs crowded";
export type FlowVerdict = "Buyers heavy" | "Balanced" | "Sellers heavy";
export type DepthVerdict = "Deep" | "OK" | "Thin";
export type PremiumVerdict = "In line" | "Above spot" | "Below spot";

const RESTING = 0.01; // Hyperliquid's resting funding, % per 8h

/**
 * Funding vs Hyperliquid's resting rate and this coin's own last 30 days (p10/p90 of the 8h rate).
 * "Crowded" needs both: clearly away from resting AND at the edge of what's normal for this coin.
 */
export function fundingVerdict(f8h: number, p10: number | null, p90: number | null): FundingVerdict {
  if (f8h >= Math.max(0.03, p90 ?? 0.03)) return "Longs crowded";
  if (f8h <= Math.min(-0.02, p10 ?? -0.02)) return "Shorts crowded";
  if (f8h < -0.002) return "Shorts pay";
  if (f8h > RESTING * 1.25) return "Above normal";
  return "Normal";
}

/** Dot position (0–100) on a scale from shorts crowded (left) to longs crowded (right); resting rate sits in the middle. */
export function fundingDot(f8h: number) {
  const x = Math.max(-0.04, Math.min(0.06, f8h));
  return ((x + 0.04) / 0.1) * 100;
}

export function flowVerdict(bidShare: number): FlowVerdict {
  return bidShare >= 60 ? "Buyers heavy" : bidShare <= 40 ? "Sellers heavy" : "Balanced";
}

/** From the cost of a $100k market order (average of buy and sell, % vs mid). null = the book can't fill it. */
export function depthVerdict(slip100k: number | null): DepthVerdict {
  if (slip100k == null) return "Thin";
  return slip100k < 0.05 ? "Deep" : slip100k < 0.3 ? "OK" : "Thin";
}

export function premiumVerdict(p: number): PremiumVerdict {
  return Math.abs(p) < 0.05 ? "In line" : p > 0 ? "Above spot" : "Below spot";
}

/** One sentence for the top of the coin page. */
export function marketRead(v: { funding: FundingVerdict; flow: FlowVerdict | null; depth: DepthVerdict | null; todayPct: number; typicalPct: number }) {
  const big = v.typicalPct > 0 && v.todayPct > v.typicalPct * 1.25;
  const head = v.funding === "Longs crowded" ? "Longs are crowded." : v.funding === "Shorts crowded" ? "Shorts are crowded." : big ? "Big day." : v.flow && v.flow !== "Balanced" ? `${v.flow}.` : "Calm and balanced.";
  const cost = v.funding === "Normal" ? "cheap to hold either way" : v.funding === "Above normal" ? "a little pricier to hold a long" : v.funding === "Longs crowded" ? "expensive to hold a long" : "longs get paid to hold";
  const depth = v.depth === "Deep" ? "deep enough that size won't move it" : v.depth === "OK" ? "fine for normal sizes" : v.depth === "Thin" ? "thin, so keep size small or use limit orders" : null;
  const day = big ? "today is already a bigger move than usual" : v.typicalPct > 0 && v.todayPct > v.typicalPct * 0.75 ? "today is close to a full normal day's move" : "today is a normal day so far";
  const parts = [cost, depth, day].filter(Boolean) as string[];
  const body = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.` : `${parts[0]}.`;
  return { head, body: body[0].toUpperCase() + body.slice(1) };
}

"use client";

// Browser-side registry of stock perps (HIP-3): Hyperliquid name ("xyz:NVDA") ↔ Perped ticker ("NVDA").
// One fetch per page load, shared by the live price socket and coin logos.

export type StockMap = { dexes: string[]; map: Record<string, string> };

let pending: Promise<StockMap> | null = null;
let value: StockMap | null = null;
let byTicker: Map<string, string> | null = null;

export function loadStockMap(): Promise<StockMap> {
  return (pending ??= fetch("/api/markets/stocks")
    .then((r) => r.json() as Promise<StockMap>)
    .then((m) => {
      value = { dexes: m.dexes ?? [], map: m.map ?? {} };
      byTicker = new Map(Object.entries(value.map).map(([hl, t]) => [t, hl]));
      return value;
    })
    .catch(() => { pending = null; return { dexes: [], map: {} }; }));
}

/** The loaded map, or null before it arrives. */
export function stockMapNow(): StockMap | null { return value; }

/** Hyperliquid name for a stock ticker ("NVDA" → "xyz:NVDA"), or null if it isn't a stock perp. */
export async function stockHl(ticker: string): Promise<string | null> {
  await loadStockMap();
  return byTicker?.get(ticker) ?? null;
}

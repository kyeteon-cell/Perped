// Read-only Hyperliquid "info" endpoint helpers. Plain fetch, no signing, safe on server and client.
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import { HL_API_URL } from "./config";

export type PerpAsset = {
  name: string; // e.g. "BTC"
  szDecimals: number;
  maxLeverage: number;
  index: number; // asset index used in orders
  onlyIsolated?: boolean;
};

export type Mids = Record<string, string>; // coin -> mid price (string)

export type AssetPosition = {
  coin: string;
  szi: string; // signed size, negative = short
  entryPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  leverage: { type: "cross" | "isolated"; value: number };
  liquidationPx: string | null;
  marginUsed: string;
};

export type ClearinghouseState = {
  marginSummary: { accountValue: string; totalNtlPos: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: { position: AssetPosition }[];
};

export type Fill = {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B"; // A = ask (sell), B = bid (buy)
  time: number;
  startPosition: string;
  dir: string; // "Open Long" | "Close Short" ...
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  builderFee?: string;
};

async function info<T>(body: Record<string, unknown>, revalidate = 0): Promise<T> {
  const res = await fetch(`${HL_API_URL}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Next.js fetch cache control; ignored in the browser.
    next: revalidate ? { revalidate } : undefined,
    cache: revalidate ? undefined : "no-store",
  } as RequestInit);
  if (!res.ok) throw new Error(`Hyperliquid info ${body.type} failed: ${res.status}`);
  return (await res.json()) as T;
}

let metaCache: { at: number; assets: PerpAsset[] } | null = null;

/** Perp universe with asset indices. Cached for 5 minutes. */
export async function getPerpAssets(): Promise<PerpAsset[]> {
  if (metaCache && Date.now() - metaCache.at < 5 * 60_000) return metaCache.assets;
  const meta = await info<{ universe: { name: string; szDecimals: number; maxLeverage: number; onlyIsolated?: boolean; isDelisted?: boolean }[] }>(
    { type: "meta" },
    300,
  );
  const assets = meta.universe
    .map((u, index) => ({ ...u, index }))
    .filter((u) => !u.isDelisted);
  metaCache = { at: Date.now(), assets };
  return assets;
}

export async function getMids(): Promise<Mids> {
  return info<Mids>({ type: "allMids" });
}

export async function getClearinghouseState(user: string): Promise<ClearinghouseState> {
  return info<ClearinghouseState>({ type: "clearinghouseState", user });
}

export async function getUserFills(user: string, aggregateByTime = true): Promise<Fill[]> {
  return info<Fill[]>({ type: "userFills", user, aggregateByTime });
}

export async function getUserFillsByTime(user: string, startTime: number, endTime?: number): Promise<Fill[]> {
  return info<Fill[]>({ type: "userFillsByTime", user, startTime, endTime, aggregateByTime: true });
}

/** Max builder fee (in tenths of a bp) the user has approved for a builder, or 0. */
export async function getMaxBuilderFee(user: string, builder: string): Promise<number> {
  try {
    const v = await info<number>({ type: "maxBuilderFee", user, builder });
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

/** Summarise a user's closed trades from fills: realised PnL, wins, losses, volume, fees. */
export function summariseFills(fills: Fill[]) {
  let realized = 0,
    fees = 0,
    volume = 0,
    wins = 0,
    losses = 0,
    best = 0,
    worst = 0;
  for (const f of fills) {
    const pnl = Number(f.closedPnl) || 0;
    const fee = Number(f.fee) || 0;
    volume += Number(f.px) * Number(f.sz);
    fees += fee;
    if (f.dir.startsWith("Close")) {
      realized += pnl;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
      best = Math.max(best, pnl);
      worst = Math.min(worst, pnl);
    }
  }
  const closed = wins + losses;
  return {
    realized,
    fees,
    volume,
    wins,
    losses,
    closed,
    winRate: closed ? (wins / closed) * 100 : 0,
    best,
    worst,
    trades: fills.length,
  };
}

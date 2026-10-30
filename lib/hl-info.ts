// Read-only Hyperliquid "info" endpoint helpers. Plain fetch, no signing, safe on server and client.
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import { HL_API_URL, HL_DATA_API_URL } from "./config";

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

/**
 * "data" = public market data from the data network (mainnet by default, so prices are real).
 * "user" = account-specific reads from the trading network (must match where orders are signed).
 */
type Scope = "data" | "user";

async function info<T>(body: Record<string, unknown>, revalidate = 0, scope: Scope = "data"): Promise<T> {
  const res = await fetch(`${scope === "user" ? HL_API_URL : HL_DATA_API_URL}/info`, {
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

const metaCache: Record<Scope, { at: number; assets: PerpAsset[] } | null> = { data: null, user: null };

/** Perp universe with asset indices (data network by default). Cached for 5 minutes per network. */
export async function getPerpAssets(scope: Scope = "data"): Promise<PerpAsset[]> {
  const c = metaCache[scope];
  if (c && Date.now() - c.at < 5 * 60_000) return c.assets;
  const meta = await info<{ universe: { name: string; szDecimals: number; maxLeverage: number; onlyIsolated?: boolean; isDelisted?: boolean }[] }>(
    { type: "meta" },
    300,
    scope,
  );
  const assets = meta.universe
    .map((u, index) => ({ ...u, index }))
    .filter((u) => !u.isDelisted);
  metaCache[scope] = { at: Date.now(), assets };
  return assets;
}

/**
 * Asset indices differ between mainnet and testnet, so orders must use the trading network's universe.
 * Looks the coin up by name on the trading network; falls back to the given row if it isn't listed there.
 */
export async function resolveTradingAsset(asset: PerpAsset): Promise<PerpAsset> {
  try {
    const a = (await getPerpAssets("user")).find((x) => x.name === asset.name);
    return a ?? asset;
  } catch {
    return asset;
  }
}

export async function getMids(): Promise<Mids> {
  return info<Mids>({ type: "allMids" });
}

export async function getClearinghouseState(user: string): Promise<ClearinghouseState> {
  return info<ClearinghouseState>({ type: "clearinghouseState", user }, 0, "user");
}

export async function getUserFills(user: string, aggregateByTime = true): Promise<Fill[]> {
  return info<Fill[]>({ type: "userFills", user, aggregateByTime }, 0, "user");
}

export async function getUserFillsByTime(user: string, startTime: number, endTime?: number): Promise<Fill[]> {
  return info<Fill[]>({ type: "userFillsByTime", user, startTime, endTime, aggregateByTime: true }, 0, "user");
}

/** Max builder fee (in tenths of a bp) the user has approved for a builder, or 0. */
export async function getMaxBuilderFee(user: string, builder: string): Promise<number> {
  try {
    const v = await info<number>({ type: "maxBuilderFee", user, builder }, 0, "user");
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

/** Per-asset market context: 24h volume, open interest, funding, mark, previous-day price. */
export type AssetCtx = {
  dayNtlVlm: string;
  openInterest: string;
  funding: string;
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  oraclePx: string;
};

export type MarketRow = PerpAsset & {
  mid: number;
  mark: number;
  change24h: number; // percent
  volume24h: number; // USD notional
  openInterest: number; // USD
  funding8h: number; // percent per 8h
};

/** Universe + live context in one call (metaAndAssetCtxs). */
export async function getMarkets(): Promise<MarketRow[]> {
  const [meta, ctxs] = await info<[{ universe: { name: string; szDecimals: number; maxLeverage: number; onlyIsolated?: boolean; isDelisted?: boolean }[] }, AssetCtx[]]>(
    { type: "metaAndAssetCtxs" },
  );
  return meta.universe
    .map((u, index) => {
      const c = ctxs[index];
      const mark = Number(c?.markPx ?? 0);
      const mid = Number(c?.midPx ?? mark);
      const prev = Number(c?.prevDayPx ?? 0);
      return {
        ...u,
        index,
        mid,
        mark,
        change24h: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
        volume24h: Number(c?.dayNtlVlm ?? 0),
        openInterest: Number(c?.openInterest ?? 0) * mark,
        funding8h: Number(c?.funding ?? 0) * 100,
      };
    })
    .filter((m) => !m.isDelisted && m.mark > 0);
}

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

/** Candles for a coin. interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d". */
export async function getCandles(coin: string, interval: string, startTime: number, endTime = Date.now()): Promise<Candle[]> {
  const raw = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
  return raw.map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v) }));
}

// Read-only Hyperliquid "info" endpoint helpers. Plain fetch, no signing, safe on server and client.
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import { HL_API_URL, HL_DATA_API_URL } from "./config";

export type MarketKind = "crypto" | "stock" | "index";

export type PerpAsset = {
  name: string; // e.g. "BTC", or "NVDA" for a stock perp (see `hl`)
  szDecimals: number;
  maxLeverage: number;
  index: number; // asset index used in orders (100000 + dex*10000 + i for HIP-3 markets)
  onlyIsolated?: boolean;
  /** "crypto" for Hyperliquid's own perps; "stock" / "index" for builder-deployed (HIP-3) equity perps. */
  kind?: MarketKind;
  /** HIP-3 only: the builder dex ("xyz") and Hyperliquid's own name for the market ("xyz:NVDA"). */
  dex?: string;
  hl?: string;
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

export async function info<T>(body: Record<string, unknown>, revalidate = 0, scope: Scope = "data"): Promise<T> {
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
  const native: PerpAsset[] = meta.universe
    .map((u, index) => ({ ...u, index, kind: "crypto" as const }))
    .filter((u) => !u.isDelisted);
  // Stock perps (HIP-3) live on mainnet builder dexes; they're added to the data-network universe only.
  const stocks = scope === "data" ? await stockUniverse(native).then((u) => u.list.map(stripCtx)).catch(() => [] as PerpAsset[]) : [];
  const assets = [...native, ...stocks];
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

/** Short in-process cache with request de-duplication: many requests in the same second share one Hyperliquid call. */
const memoStore = new Map<string, { at: number; v: Promise<unknown> }>();
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key), now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.v as Promise<T>;
  const v = fn();
  memoStore.set(key, { at: now, v });
  v.catch(() => { if (memoStore.get(key)?.v === v) memoStore.delete(key); });
  if (memoStore.size > 500) for (const [k, e] of memoStore) if (now - e.at > 120_000) memoStore.delete(k);
  return v;
}

/** Live mids for every market, stock perps included (keyed by Perped's name, "NVDA", not "xyz:NVDA"). */
export async function getMids(): Promise<Mids> {
  return memo("mids", 2_000, async () => {
    const [native, st] = await Promise.all([info<Mids>({ type: "allMids" }), stockUniverse().catch(() => null)]);
    if (!st?.list.length) return native;
    const out: Mids = { ...native };
    const dexes = [...new Set(st.list.map((m) => m.dex!))];
    const per = await Promise.all(dexes.map((dex) => info<Mids>({ type: "allMids", dex }).catch(() => ({} as Mids))));
    for (const m of per) for (const [k, v] of Object.entries(m)) { const a = st.byHl.get(k); if (a) out[a.name] = v; }
    // Fall back to the mark from the market snapshot for anything the mids call missed.
    for (const a of st.list) if (!out[a.name] && a.mark > 0) out[a.name] = String(a.mark);
    return out;
  });
}

/** Hyperliquid's API name for a Perped market name: "NVDA" → "xyz:NVDA"; crypto names pass through. */
export async function hlName(coin: string): Promise<string> {
  if (coin.includes(":")) return coin;
  const st = await stockUniverse().catch(() => null);
  return st?.byName.get(coin)?.hl ?? coin;
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
export type OpenOrder = { coin: string; oid: number; side: "A" | "B"; sz: string; limitPx: string; reduceOnly?: boolean; isTrigger?: boolean; triggerPx?: string; orderType?: string };
/** Open orders on the trading network, with trigger / reduce-only flags. */
export async function getFrontendOpenOrders(user: string): Promise<OpenOrder[]> {
  return info<OpenOrder[]>({ type: "frontendOpenOrders", user }, 0, "user");
}

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
  oracle: number; // spot index price
  premiumPct: number; // mark vs index, percent
};

/** Universe + live context in one call (metaAndAssetCtxs), crypto perps plus stock perps (HIP-3). */
export async function getMarkets(): Promise<MarketRow[]> {
  return memo("markets", 5_000, async () => {
    const [native, st] = await Promise.all([loadMarkets(), stockUniverse().catch(() => null)]);
    return [...native, ...(st?.list ?? [])];
  });
}
async function loadMarkets(): Promise<MarketRow[]> {
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
        kind: "crypto" as const,
        mid,
        mark,
        change24h: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
        volume24h: Number(c?.dayNtlVlm ?? 0),
        openInterest: Number(c?.openInterest ?? 0) * mark,
        // Hyperliquid quotes funding per hour (paid hourly); show it per 8h like other venues.
        funding8h: Number(c?.funding ?? 0) * 100 * 8,
        oracle: Number(c?.oraclePx ?? 0),
        premiumPct: Number(c?.oraclePx) > 0 ? ((mark - Number(c.oraclePx)) / Number(c.oraclePx)) * 100 : 0,
      };
    })
    .filter((m) => !m.isDelisted && m.mark > 0);
}

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

/** Candles for a coin. interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d". */
export async function getCandles(coin: string, interval: string, startTime: number, endTime = Date.now()): Promise<Candle[]> {
  // Same coin/interval/window within 10s shares one fetch (start rounded to the minute).
  return memo(`c:${coin}:${interval}:${Math.round(startTime / 60_000)}`, 10_000, () => loadCandles(coin, interval, startTime, endTime));
}
async function loadCandles(coin: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  const raw = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>({
    type: "candleSnapshot",
    req: { coin: await hlName(coin), interval, startTime, endTime },
  });
  return raw.map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v) }));
}

// ---------------------------------------------------------------------------------------------------------
// Stock perps (HIP-3). Builder-deployed dexes such as TradeXYZ ("xyz") list equities and indices that settle
// on Hyperliquid's order book. Perped shows every stock / index market Hyperliquid has, one market per ticker
// (the busiest listing wins, USDC-collateral dexes preferred), under the plain ticker ("NVDA").
// Hyperliquid's own name for it ("xyz:NVDA") is only used when talking to the API.
// ---------------------------------------------------------------------------------------------------------

/** Tickers on HIP-3 dexes that aren't stocks: commodities, FX, rates, volatility, compute and other baskets. */
const NOT_STOCK = new Set([
  "GOLD", "SILVER", "XAU", "XAG", "XAUT", "PAXG", "CL", "WTI", "OIL", "USOIL", "UKOIL", "BRENT", "BZ", "NG", "NATGAS", "GAS", "GASOLINE", "RBOB", "HO",
  "COPPER", "HG", "PLATINUM", "PLAT", "XPT", "PALLADIUM", "XPD", "URANIUM", "ALUMINUM", "ALUMINIUM", "NICKEL", "ZINC", "LITHIUM", "IRON", "IRONORE", "STEEL", "COBALT",
  "WHEAT", "CORN", "SOY", "SOYBEAN", "SOYBEANS", "COFFEE", "COCOA", "SUGAR", "COTTON", "CATTLE", "HOGS", "LUMBER", "RICE", "OJ", "OATS",
  "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNH", "CNY", "MXN", "KRW", "INR", "SGD", "HKD", "BRL", "TRY", "ZAR", "SEK", "NOK", "DXY", "USDX",
  "US10Y", "US2Y", "US5Y", "US30Y", "TNX", "BOND", "BONDS", "VIX", "VVIX", "MOVE", "VOL", "BVIV", "EVIV",
  "GPU", "H100", "H200", "B200", "A100", "COMPUTE", "ELECTRICITY", "POWER", "FUNDING", "BTCD", "ETHD", "TOTAL", "TOTAL2", "TOTAL3", "OTHERS",
  "USDT", "USDC", "USDH", "USDE", "BTC", "ETH", "SOL", "BRENTOIL", "WTIOIL", "CRUDE", "CRUDEOIL", "PURRDAT", "ANSEM",
]);
const FX = ["EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNH", "CNY", "MXN", "USD", "SGD", "HKD", "KRW", "INR"];
/** Equity indices and index funds, shown as "index" rather than single stocks. */
const INDEX = new Set([
  "SP500", "US500", "SPX", "SPY", "XYZ100", "NDX", "NAS100", "US100", "USTECH", "USTECH100", "QQQ", "DJI", "DJIA", "US30", "DOW", "RUT", "RUSSELL", "US2000", "IWM", "DIA",
  "MAG7", "NIKKEI", "JP225", "N225", "DAX", "DE40", "GER40", "FTSE", "UK100", "HSI", "HK50", "KOSPI", "CHINA50", "CN50", "STOXX50", "EU50", "CAC40", "FR40", "ASX200", "AUS200", "NIFTY", "SMH", "SOXX",
  // Index funds (ETFs): country, sector, leveraged and bond funds.
  "SOXL", "EWY", "EWZ", "EWJ", "EWT", "KORU", "TLT", "MAGS", "XLE", "URNM", "GDX", "IGV", "XBI", "DRV", "KR200",
]);

function classify(base: string, nativeNames: Set<string>): Exclude<MarketKind, "crypto"> | null {
  if (!/^[A-Z][A-Z0-9.]{0,11}$/.test(base)) return null; // lower-case / odd names are crypto-style listings
  if (NOT_STOCK.has(base) || nativeNames.has(base)) return null; // commodities, FX, and crypto already on Hyperliquid
  if (base.length === 6 && FX.includes(base.slice(0, 3)) && FX.includes(base.slice(3))) return null; // EURUSD, USDJPY
  if (INDEX.has(base)) return "index";
  return "stock";
}

type StockRow = MarketRow & { kind: "stock" | "index"; dex: string; hl: string; collateral: number };
type Universe = { list: StockRow[]; byName: Map<string, StockRow>; byHl: Map<string, StockRow> };

function stripCtx(m: StockRow): PerpAsset {
  return { name: m.name, szDecimals: m.szDecimals, maxLeverage: m.maxLeverage, index: m.index, onlyIsolated: true, kind: m.kind, dex: m.dex, hl: m.hl };
}

/** Every stock / index perp on every HIP-3 dex, with live context. Shared for 5s; dex list for 10 min. */
export function stockUniverse(native?: PerpAsset[]): Promise<Universe> {
  return memo("stocks", 5_000, () => loadStocks(native));
}

async function loadStocks(nativeIn?: PerpAsset[]): Promise<Universe> {
  const dexes = await memo("perpDexs", 600_000, () => info<({ name: string } | null)[]>({ type: "perpDexs" }, 600));
  let nativeNames: Set<string>;
  if (nativeIn) nativeNames = new Set(nativeIn.map((a) => a.name));
  else {
    const meta = await memo("nativeMeta", 300_000, () => info<{ universe: { name: string }[] }>({ type: "meta" }, 300));
    nativeNames = new Set(meta.universe.map((u) => u.name));
  }
  const listed = dexes.map((d, idx) => (d?.name ? { name: d.name, idx } : null)).filter((d): d is { name: string; idx: number } => !!d && d.idx > 0);
  const per = await Promise.all(listed.map(async (d) => {
    try {
      const [meta, ctxs] = await info<[{ universe: { name: string; szDecimals: number; maxLeverage: number; onlyIsolated?: boolean; isDelisted?: boolean }[]; collateralToken?: number }, AssetCtx[]]>({ type: "metaAndAssetCtxs", dex: d.name });
      const out: StockRow[] = [];
      meta.universe.forEach((u, i) => {
        if (u.isDelisted) return;
        const hl = u.name.includes(":") ? u.name : `${d.name}:${u.name}`;
        const base = hl.slice(hl.indexOf(":") + 1);
        const kind = classify(base, nativeNames);
        const c = ctxs[i];
        const mark = Number(c?.markPx ?? 0);
        if (!kind || !(mark > 0)) return;
        const prev = Number(c?.prevDayPx ?? 0), oracle = Number(c?.oraclePx ?? 0);
        out.push({
          name: base, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, onlyIsolated: true,
          index: 100_000 + d.idx * 10_000 + i, kind, dex: d.name, hl, collateral: Number(meta.collateralToken ?? 0),
          mid: Number(c?.midPx ?? mark), mark,
          change24h: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
          volume24h: Number(c?.dayNtlVlm ?? 0),
          openInterest: Number(c?.openInterest ?? 0) * mark,
          funding8h: Number(c?.funding ?? 0) * 100 * 8,
          oracle, premiumPct: oracle > 0 ? ((mark - oracle) / oracle) * 100 : 0,
        });
      });
      return out;
    } catch { return [] as StockRow[]; }
  }));
  // One market per ticker: the busiest listing, with USDC-collateral dexes (token 0) given a head start.
  const best = new Map<string, StockRow>();
  const score = (m: StockRow) => (m.volume24h + m.openInterest * 0.1) * (m.collateral === 0 ? 1.5 : 1);
  for (const m of per.flat()) {
    if (m.volume24h < 5_000 && m.openInterest < 25_000) continue; // dead or test listings
    const have = best.get(m.name);
    if (!have || score(m) > score(have)) best.set(m.name, m);
  }
  const list = [...best.values()].sort((a, b) => b.volume24h - a.volume24h);
  return { list, byName: new Map(list.map((m) => [m.name, m])), byHl: new Map(list.map((m) => [m.hl, m])) };
}

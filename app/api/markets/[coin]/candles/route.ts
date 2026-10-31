import { getCandles } from "@/lib/hl-info";

const RANGES: Record<string, { interval: string; ms: number }> = {
  "1h": { interval: "1m", ms: 60 * 60_000 },
  "4h": { interval: "5m", ms: 4 * 60 * 60_000 },
  "1d": { interval: "15m", ms: 24 * 60 * 60_000 },
  "1w": { interval: "1h", ms: 7 * 24 * 60 * 60_000 },
  "1m": { interval: "4h", ms: 30 * 24 * 60 * 60_000 },
};
const INTERVAL_MS: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

/**
 * GET /api/markets/:coin/candles?interval=1m|5m|15m|1h|4h|1d[&limit=500]   (preferred, mainnet data)
 * GET /api/markets/:coin/candles?range=1h|4h|1d|1w|1m                      (legacy)
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ coin: string }> }) {
  const { coin } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const interval = q.get("interval");
  let iv: string, since: number;
  if (interval && INTERVAL_MS[interval]) {
    const limit = Math.min(1000, Math.max(50, Number(q.get("limit") ?? 500)));
    iv = interval; since = Date.now() - INTERVAL_MS[interval] * limit;
  } else {
    const range = RANGES[q.get("range") ?? "1d"] ?? RANGES["1d"];
    iv = range.interval; since = Date.now() - range.ms;
  }
  const candles = await getCandles(coin.toUpperCase(), iv, since);
  return Response.json({ coin: coin.toUpperCase(), interval: iv, candles }, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" } });
}

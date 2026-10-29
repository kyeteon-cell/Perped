import { getCandles } from "@/lib/hl-info";

const RANGES: Record<string, { interval: string; ms: number }> = {
  "1h": { interval: "1m", ms: 60 * 60_000 },
  "1d": { interval: "15m", ms: 24 * 60 * 60_000 },
  "1w": { interval: "1h", ms: 7 * 24 * 60 * 60_000 },
};

/** GET /api/markets/:coin/candles?range=1h|1d|1w */
export async function GET(req: Request, ctx: { params: Promise<{ coin: string }> }) {
  const { coin } = await ctx.params;
  const range = RANGES[new URL(req.url).searchParams.get("range") ?? "1h"] ?? RANGES["1h"];
  const candles = await getCandles(coin.toUpperCase(), range.interval, Date.now() - range.ms);
  return Response.json({ coin: coin.toUpperCase(), candles });
}

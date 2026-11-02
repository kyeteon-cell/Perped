import { bookStats } from "@/lib/market-stats";
import { normCoin } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/markets/:coin/book → spread, depth within 0.5% / 2%, and market-order slippage for $1k / $10k / $100k. */
export async function GET(_req: Request, ctx: { params: Promise<{ coin: string }> }) {
  const { coin } = await ctx.params;
  try {
    return Response.json(await bookStats(normCoin(coin)), { headers: { "cache-control": "public, s-maxage=3, stale-while-revalidate=10" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 404 });
  }
}

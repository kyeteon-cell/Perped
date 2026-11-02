import { coinStats } from "@/lib/market-stats";
import { normCoin } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/markets/:coin/stats → funding (now, other exchanges, 7-day history), premium, typical day, liquidation distance. */
export async function GET(_req: Request, ctx: { params: Promise<{ coin: string }> }) {
  const { coin } = await ctx.params;
  try {
    const stats = await coinStats(normCoin(coin));
    return Response.json(stats, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 404 });
  }
}

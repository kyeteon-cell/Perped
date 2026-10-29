import { getMarkets } from "@/lib/hl-info";

export const revalidate = 0;

/** GET /api/markets → every perp with mid, 24h change, volume, open interest, funding. */
export async function GET() {
  const markets = await getMarkets();
  markets.sort((a, b) => b.volume24h - a.volume24h);
  return Response.json({ markets, at: Date.now() });
}

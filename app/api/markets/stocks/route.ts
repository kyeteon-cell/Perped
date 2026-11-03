import { stockUniverse } from "@/lib/hl-info";

/** GET /api/markets/stocks → which builder dexes carry Perped's stock perps, and Hyperliquid name → Perped ticker. Used by the live price socket. */
export const dynamic = "force-dynamic";

export async function GET() {
  const st = await stockUniverse().catch(() => null);
  if (!st) return Response.json({ dexes: [], map: {} }, { headers: { "cache-control": "public, s-maxage=30" } });
  const map = Object.fromEntries(st.list.map((m) => [m.hl, m.name]));
  const dexes = [...new Set(st.list.map((m) => m.dex))];
  return Response.json({ dexes, map }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}

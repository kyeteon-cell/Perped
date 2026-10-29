import { getMids, getPerpAssets } from "@/lib/hl-info";

export const revalidate = 0;

/** GET /api/markets → tradeable perps with current mids. */
export async function GET() {
  const [assets, mids] = await Promise.all([getPerpAssets(), getMids()]);
  const markets = assets
    .map((a) => ({ ...a, mid: Number(mids[a.name] ?? 0) }))
    .filter((a) => a.mid > 0)
    .sort((a, b) => a.index - b.index);
  return Response.json({ markets, at: Date.now() });
}

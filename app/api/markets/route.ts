import { sql } from "drizzle-orm";
import { getMarkets } from "@/lib/hl-info";
import { db } from "@/lib/db";

export const revalidate = 0;
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** Open interest 24h ago per coin, from our 10-minute snapshots (nearest within an hour of 24h). Cached 5 min. */
let oiCache: { at: number; v: Promise<Record<string, number>> } | null = null;
function oiDayAgo() {
  if (oiCache && Date.now() - oiCache.at < 300_000) return oiCache.v;
  const v = (async () => {
    const r = rows(await db.execute(sql`select distinct on (coin) coin, oi from market_oi
      where at between now() - interval '25 hours' and now() - interval '23 hours'
      order by coin, abs(extract(epoch from at - (now() - interval '24 hours')))`));
    return Object.fromEntries(r.map((x) => [String(x.coin), Number(x.oi)]));
  })().catch(() => ({} as Record<string, number>));
  oiCache = { at: Date.now(), v };
  return v;
}

/** GET /api/markets → every perp with mid, 24h change, volume, open interest (+ 24h change once we have history), funding, premium. */
export const dynamic = "force-dynamic";

export async function GET() {
  const [markets, ago] = await Promise.all([getMarkets().catch(() => null), oiDayAgo()]);
  if (!markets) return Response.json({ error: "Hyperliquid is not answering right now", markets: [] }, { status: 502, headers: { "cache-control": "public, s-maxage=5" } });
  const out = markets.map((m) => ({ ...m, oiChange24h: ago[m.name] > 0 ? ((m.openInterest - ago[m.name]) / ago[m.name]) * 100 : null }));
  out.sort((a, b) => b.volume24h - a.volume24h);
  return Response.json({ markets: out, at: Date.now() }, { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=30" } });
}

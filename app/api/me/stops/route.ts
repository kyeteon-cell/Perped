import { getAuth, unauthorized } from "@/lib/auth";
import { enforceDemoStops } from "@/lib/demo-stops";

export const dynamic = "force-dynamic";

// One check per person every few seconds per server instance; the work itself is cached (mids 2s, candles 10s).
const last = new Map<string, number>();

/**
 * POST /api/me/stops → check your open demo trades' stop-loss, take-profit and liquidation right now.
 * The app calls this the moment it sees a level crossed, so stops don't wait for the 5-minute cron.
 * The server decides from Hyperliquid's own prices; nothing the client sends is used.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = auth.privyId, now = Date.now();
  if (now - (last.get(me) ?? 0) < 3_000) return Response.json({ closed: 0, throttled: true });
  last.set(me, now);
  if (last.size > 5_000) last.clear();
  const closed = await enforceDemoStops(me).catch(() => 0);
  return Response.json({ closed });
}

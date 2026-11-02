import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { getMarkets } from "@/lib/hl-info";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/cron/markets → every 10 min: snapshot open interest for every perp (kept 8 days) so the app can show OI change. */
export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const markets = await getMarkets();
  const at = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();
  const rows = JSON.stringify(markets.map((m) => ({ c: m.name, o: m.openInterest })));
  await db.execute(sql`insert into market_oi (coin, at, oi)
    select x->>'c', ${at}::timestamptz, (x->>'o')::numeric from jsonb_array_elements(${rows}::jsonb) x
    on conflict (coin, at) do update set oi = excluded.oi`);
  await db.execute(sql`delete from market_oi where at < now() - interval '8 days'`);
  return Response.json({ ok: true, coins: markets.length, at });
}

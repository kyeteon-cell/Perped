import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { DAILY_BONUS_XP, getDaily } from "@/lib/daily";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** GET /api/daily → today's Daily Fade target, how many are fading it, and your fade on it if you have one. */
export async function GET(req: Request) {
  const d = await getDaily().catch(() => null);
  if (!d) return Response.json({ daily: null });
  const auth = await getAuth(req).catch(() => null);
  const [c] = rows(await db.execute(sql`select count(*)::int as n,
      ${auth ? sql`max(case when fader_id = ${auth.privyId} then fader_post_id end)` : sql`null::int`} as mine
    from battles where target_post_id = ${d.postId}`));
  const { history: _h, ...pub } = d; void _h;
  return Response.json({ daily: { ...pub, faders: Number(c?.n ?? 0), myBattle: c?.mine ? Number(c.mine) : null, bonus: DAILY_BONUS_XP } }, { headers: { "cache-control": "private, no-store" } });
}

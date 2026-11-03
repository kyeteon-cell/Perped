import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/**
 * GET /api/me/fades → your live fades: both legs (so the app can score them at live prices), the opponent,
 * and which of your posts is in it. Used by the positions pill for the live W–L.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = auth.privyId;
  const leg = (a: string) => sql.raw(`json_build_object('id', ${a}.id, 'side', ${a}.side, 'entryPx', ${a}.entry_px, 'exitPx', ${a}.exit_px, 'size', ${a}.size, 'leverage', ${a}.leverage, 'status', ${a}.status, 'realizedPnl', ${a}.realized_pnl, 'meta', ${a}.meta, 'coin', ${a}.coin, 'slPx', ${a}.sl_px, 'tpPx', ${a}.tp_px, 'createdAt', ${a}.created_at)`);
  const r = rows(await db.execute(sql`
    select b.fader_post_id as "battleId", (b.fader_id = ${me}) as "iFade",
      ou.handle as "opp", ou.avatar_url as "oppAvatar",
      ${leg("fp")} as "fader", ${leg("tp")} as "target"
    from battles b
      join posts fp on fp.id = b.fader_post_id join posts tp on tp.id = b.target_post_id
      join users ou on ou.id = case when b.fader_id = ${me} then b.target_id else b.fader_id end
    where b.status = 'open' and (b.fader_id = ${me} or b.target_id = ${me})
      and not (fp.status = 'closed' and tp.status = 'closed') -- both closed: decided, it's settling
    order by b.id desc limit 30`));
  return Response.json({ fades: r }, { headers: { "cache-control": "private, no-store" } });
}

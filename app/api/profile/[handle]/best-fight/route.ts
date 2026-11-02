import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** GET → this trader's best fade win: the biggest winning margin, with the opponent. Public. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const [u] = rows(await db.execute(sql`select id from users where lower(handle) = ${handle} limit 1`));
  if (!u) return Response.json({ fight: null });
  const uid = String(u.id);
  const [f] = rows(await db.execute(sql`
    select b.fader_post_id as id, b.coin, b.settled_at, b.reason,
      case when b.fader_id = ${uid} then b.fader_roi else b.target_roi end::float as my_roi,
      case when b.fader_id = ${uid} then b.target_roi else b.fader_roi end::float as their_roi,
      (b.fader_id = ${uid}) as i_faded, ou.handle as opp, ou.avatar_url as opp_avatar, ou.xp as opp_xp,
      (select count(*)::int from battles x where x.status = 'settled' and x.winner_id = ${uid}) as wins
    from battles b join users ou on ou.id = case when b.fader_id = ${uid} then b.target_id else b.fader_id end
    where b.status = 'settled' and b.winner_id = ${uid} and b.fader_roi is not null and b.target_roi is not null
    order by abs(b.fader_roi - b.target_roi) desc, b.settled_at desc limit 1`));
  if (!f) return Response.json({ fight: null }, { headers: { "cache-control": "public, s-maxage=60" } });
  return Response.json({ fight: {
    id: Number(f.id), coin: String(f.coin), settledAt: f.settled_at, reason: f.reason ?? null,
    myRoi: Number(f.my_roi), theirRoi: Number(f.their_roi), iFaded: !!f.i_faded,
    opp: String(f.opp), oppAvatar: (f.opp_avatar as string) ?? null, oppXp: Number(f.opp_xp ?? 0), wins: Number(f.wins ?? 0),
  } }, { headers: { "cache-control": "public, s-maxage=60" } });
}

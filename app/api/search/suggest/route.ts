import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

type Pick = { handle: string; avatarUrl: string | null; xp: number; role: string | null; founderSeat: number | null; founderStatus: string | null; verified: boolean; why: string };

/**
 * GET /api/search/suggest → "Traders to watch": people who faded you lately and your rivals (when signed in),
 * then who's climbing fastest this week and new founders. One reason line each, five at most.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req).catch(() => null);
  const me = auth?.privyId ?? null;
  const cols = sql`u.handle, u.avatar_url as "avatarUrl", u.xp, u.role, u.founder_seat as "founderSeat", u.founder_status as "founderStatus", u.verified`;
  const [faders, rivals, climbers, founders] = await Promise.all([
    me ? db.execute(sql`select ${cols}, count(*)::int as n from battles b join users u on u.id = b.fader_id
      where b.target_id = ${me} and b.created_at > now() - interval '14 days' group by u.id order by n desc limit 2`).then(rows).catch(() => []) : Promise.resolve([]),
    me ? db.execute(sql`select ${cols}, case when r.user_a = ${me} then r.a_wins else r.b_wins end as mine, case when r.user_a = ${me} then r.b_wins else r.a_wins end as theirs
      from rivalries r join users u on u.id = case when r.user_a = ${me} then r.user_b else r.user_a end
      where r.user_a = ${me} or r.user_b = ${me} order by (r.a_wins + r.b_wins) desc limit 2`).then(rows).catch(() => []) : Promise.resolve([]),
    db.execute(sql`select ${cols}, sum(x.delta)::int as gained from xp_log x join users u on u.id = x.user_id
      where x.created_at > now() - interval '7 days' and u.handle is not null ${me ? sql`and u.id <> ${me}` : sql``} group by u.id having sum(x.delta) > 0 order by gained desc limit 4`).then(rows).catch(() => []),
    db.execute(sql`select ${cols} from users u where u.founder_seat is not null and coalesce(u.founder_status, '') <> 'expired'
      and u.founder_since > now() - interval '14 days' ${me ? sql`and u.id <> ${me}` : sql``} order by u.founder_since desc limit 2`).then(rows).catch(() => []),
  ]);
  const out: Pick[] = [];
  const add = (r: Record<string, unknown>, why: string) => {
    if (!r.handle || out.some((o) => o.handle === r.handle) || out.length >= 5) return;
    out.push({ handle: String(r.handle), avatarUrl: (r.avatarUrl as string) ?? null, xp: Number(r.xp ?? 0), role: (r.role as string) ?? null, founderSeat: r.founderSeat == null ? null : Number(r.founderSeat), founderStatus: (r.founderStatus as string) ?? null, verified: !!r.verified, why });
  };
  for (const r of faders) add(r, Number(r.n) > 1 ? `Faded you ${r.n} times lately` : "Faded you lately");
  for (const r of rivals) add(r, `Your rival · ${r.mine}–${r.theirs}`);
  for (const r of climbers) add(r, `+${Number(r.gained).toLocaleString()} XP this week`);
  for (const r of founders) add(r, `Founder #${r.founderSeat} · new this week`);
  return Response.json({ traders: out }, { headers: { "cache-control": me ? "private, no-store" : "public, s-maxage=120" } });
}

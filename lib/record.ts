import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * A trader's fade record, counted straight from the settled fights (the one source of truth). The running
 * counters in `stats` could drift (reopened fights, old bugs), so every screen that shows a W–L uses this,
 * and it writes the exact numbers back so the leaderboard agrees too.
 */
export async function fadeRecord(userId: string) {
  const r = (await db.execute(sql`
    select count(*) filter (where winner_id = ${userId})::int as w,
      count(*) filter (where winner_id is not null and winner_id <> ${userId})::int as l,
      count(*) filter (where winner_id is null)::int as d
    from battles where status = 'settled' and (fader_id = ${userId} or target_id = ${userId})`)) as unknown as { w: number; l: number; d: number }[];
  const x = (Array.from(r as Iterable<{ w: number; l: number; d: number }>)[0]) ?? { w: 0, l: 0, d: 0 };
  const rec = { won: Number(x.w), lost: Number(x.l), drawn: Number(x.d) };
  await db.execute(sql`update stats set battles_won = ${rec.won}, battles_lost = ${rec.lost} where user_id = ${userId} and (battles_won <> ${rec.won} or battles_lost <> ${rec.lost})`).catch(() => null);
  return rec;
}

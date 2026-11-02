import { sql } from "drizzle-orm";
import { db } from "./db";

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** Monday 00:00 UTC of the week before this one, and of this one. */
export function lastWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  const end = new Date(d.getTime() - dow * 86_400_000);
  return { start: new Date(end.getTime() - 7 * 86_400_000), end };
}

/** Your last full week: fades won and lost, trades closed and P&L, your best trade, XP gained. */
export async function weekRecap(uid: string, start: Date, end: Date) {
  const [f] = rows(await db.execute(sql`select count(*) filter (where winner_id = ${uid})::int as w,
      count(*) filter (where winner_id is not null and winner_id <> ${uid})::int as l, count(*) filter (where winner_id is null)::int as d
    from battles where status = 'settled' and settled_at >= ${start.toISOString()}::timestamptz and settled_at < ${end.toISOString()}::timestamptz and (fader_id = ${uid} or target_id = ${uid})`));
  const [t] = rows(await db.execute(sql`select count(*)::int as n, coalesce(sum(realized_pnl::numeric), 0)::float as pnl,
      count(*) filter (where realized_pnl::numeric > 0)::int as wins
    from posts where user_id = ${uid} and kind = 'trade' and status = 'closed' and closed_at >= ${start.toISOString()}::timestamptz and closed_at < ${end.toISOString()}::timestamptz`));
  const [best] = rows(await db.execute(sql`select id, coin, side, coalesce(leverage, 1) as lev,
      (realized_pnl::numeric / nullif(size::numeric * entry_px::numeric / coalesce(leverage, 1), 0) * 100)::float as roi
    from posts where user_id = ${uid} and kind = 'trade' and status = 'closed' and closed_at >= ${start.toISOString()}::timestamptz and closed_at < ${end.toISOString()}::timestamptz and realized_pnl is not null
    order by roi desc nulls last limit 1`));
  const [x] = rows(await db.execute(sql`select coalesce(sum(delta), 0)::int as xp from xp_log where user_id = ${uid} and created_at >= ${start.toISOString()}::timestamptz and created_at < ${end.toISOString()}::timestamptz`));
  return {
    start: start.toISOString(), end: end.toISOString(),
    fades: { w: Number(f?.w ?? 0), l: Number(f?.l ?? 0), d: Number(f?.d ?? 0) },
    trades: { n: Number(t?.n ?? 0), wins: Number(t?.wins ?? 0), pnl: Number(t?.pnl ?? 0) },
    best: best && Number.isFinite(Number(best.roi)) ? { id: Number(best.id), coin: String(best.coin), side: String(best.side), lev: Number(best.lev), roi: Number(best.roi) } : null,
    xp: Number(x?.xp ?? 0),
  };
}


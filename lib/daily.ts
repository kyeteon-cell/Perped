import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * The Daily Fade: one open trade a day that everyone is invited to fade. Beat it and you get bonus XP.
 * Picked once per UTC day (humans before bots, highest rank first, leveraged trades opened recently) and kept in
 * app_settings; if that trade closes during the day, a fresh one takes its place. `history` remembers the last
 * targets so a fade started on yesterday's pick still pays when it settles today.
 */
export type Daily = { date: string; postId: number; handle: string; avatarUrl: string | null; coin: string; side: string; leverage: number; entryPx: string; createdAt: string; history: number[] };
export const DAILY_BONUS_XP = 50;
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const today = () => new Date().toISOString().slice(0, 10);

let memo: { at: number; v: Daily | null } | null = null;

export async function getDaily(): Promise<Daily | null> {
  if (memo && Date.now() - memo.at < 60_000) return memo.v;
  const [cur] = rows(await db.execute(sql`select value from app_settings where key = 'daily_fade'`));
  const v = (cur?.value ?? null) as Daily | null;
  if (v && v.date === today()) {
    const [still] = rows(await db.execute(sql`select 1 as ok from posts where id = ${v.postId} and status = 'open'`));
    if (still) { memo = { at: Date.now(), v }; return v; }
  }
  const [pick] = rows(await db.execute(sql`
    select p.id, p.coin, p.side, coalesce(p.leverage, 1) as leverage, p.entry_px, p.created_at, u.handle, u.avatar_url
    from posts p join users u on u.id = p.user_id
    where p.kind = 'trade' and p.status = 'open' and p.created_at > now() - interval '36 hours'
      and coalesce(p.leverage, 1) >= 2 and p.faded_from_id is null and p.copied_from_id is null
      ${v?.history?.length ? sql`and p.id not in (${sql.join(v.history.map((h) => sql`${h}`), sql`, `)})` : sql``}
    order by u.is_bot asc, u.xp desc, p.created_at desc limit 1`));
  if (!pick) { memo = { at: Date.now(), v: null }; return null; }
  const next: Daily = {
    date: today(), postId: Number(pick.id), handle: String(pick.handle), avatarUrl: (pick.avatar_url as string) ?? null,
    coin: String(pick.coin), side: String(pick.side), leverage: Number(pick.leverage), entryPx: String(pick.entry_px),
    createdAt: new Date(pick.created_at as string).toISOString(),
    history: [Number(pick.id), ...(v?.history ?? [])].slice(0, 10),
  };
  await db.execute(sql`insert into app_settings (key, value) values ('daily_fade', ${JSON.stringify(next)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
  memo = { at: Date.now(), v: next };
  return next;
}

/** Was this trade a Daily Fade target (today or in the last few days)? */
export async function isDailyTarget(postId: number) {
  const [cur] = rows(await db.execute(sql`select value from app_settings where key = 'daily_fade'`));
  const v = (cur?.value ?? null) as Daily | null;
  return !!v && (v.postId === postId || (v.history ?? []).includes(postId));
}

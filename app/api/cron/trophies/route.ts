import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { syncAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/**
 * GET /api/cron/trophies → every 10 min: unlock trophies for anyone who did something recently.
 * The first run backfills everyone silently (no notifications or feed posts for old history).
 */
export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const [done] = rows(await db.execute(sql`select value from app_settings where key = 'trophies_backfill' limit 1`));
  if (!done) {
    const all = rows(await db.execute(sql`select u.id from users u where not u.is_bot and exists (select 1 from posts p where p.user_id = u.id) order by u.created_at`));
    let n = 0;
    for (const r of all) { if (Date.now() - started > 50_000) break; await syncAchievements(String(r.id), { silent: true }).catch(() => null); n++; }
    if (n === all.length) await db.execute(sql`insert into app_settings (key, value) values ('trophies_backfill', ${JSON.stringify({ at: new Date().toISOString(), users: n })}::jsonb) on conflict (key) do nothing`);
    return Response.json({ backfill: n, of: all.length });
  }
  // Anyone with a trade, close, call result or settled fade in the last 15 minutes.
  const active = rows(await db.execute(sql`
    select distinct uid from (
      select user_id as uid from posts where created_at > now() - interval '15 minutes' or closed_at > now() - interval '15 minutes' or resolved_at > now() - interval '15 minutes'
      union select fader_id from battles where settled_at > now() - interval '15 minutes'
      union select target_id from battles where settled_at > now() - interval '15 minutes'
      union select s.user_id from posts f join posts s on s.id = coalesce(f.copied_from_id, f.faded_from_id) where f.created_at > now() - interval '15 minutes'
      union select r.referred_by from users r where r.referred_by is not null and exists (select 1 from posts p where p.user_id = r.id and p.created_at > now() - interval '15 minutes')
    ) x where uid is not null`));
  let unlocked = 0, checked = 0;
  for (const r of active) { if (Date.now() - started > 50_000) break; unlocked += (await syncAchievements(String(r.uid)).catch(() => [])).length; checked++; }
  return Response.json({ checked, unlocked });
}

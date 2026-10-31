import { sql } from "drizzle-orm";
import { db, schema } from "./db";
import { isFightNight } from "./fightnight";
import { pushTo } from "./push";
import { systemPost } from "./feed";

/**
 * Cron (every 5 min): when Fight Night opens, tell everyone once: an in-app notification for people active in the
 * last two weeks, a push to every device with alerts on, and a feed card. Deduped per day in schema_meta.
 */
export async function fightNightKickoff() {
  const now = new Date();
  if (!isFightNight(now) || now.getUTCMinutes() > 20) return 0;
  const key = `fight_night_${now.toISOString().slice(0, 10)}`;
  const claimed = (await db.execute(sql`insert into schema_meta (key, value) values (${key}, 'sent') on conflict (key) do nothing returning key`)) as unknown as unknown[];
  if (!Array.from(claimed as Iterable<unknown>).length) return 0;
  const title = "Fight Night is LIVE";
  const body = "For the next hour every battle you start pays double XP. Get in the Arena.";
  const active = (await db.execute(sql`
    select distinct u.id from users u
    where not u.is_bot and (u.created_at > now() - interval '14 days'
      or exists (select 1 from posts p where p.user_id = u.id and p.created_at > now() - interval '14 days'))
    limit 5000`)) as unknown as { id: string }[];
  const ids = Array.from(active as Iterable<{ id: string }>).map((r) => r.id);
  if (ids.length) await db.insert(schema.notifications).values(ids.map((userId) => ({ userId, type: "fightnight", title, body, href: "/arena" })));
  const subs = (await db.execute(sql`select distinct user_id from push_subs`)) as unknown as { user_id: string }[];
  const pushIds = Array.from(subs as Iterable<{ user_id: string }>).map((r) => r.user_id);
  if (pushIds.length) await pushTo(pushIds, { title, body, href: "/arena", tag: "fightnight" });
  await systemPost("fightnight", "Fight Night is live. Every battle started in the next hour pays double XP.", { endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15)).toISOString() });
  return ids.length;
}

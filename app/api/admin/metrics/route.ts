import { sql, type SQL } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { BUILDER_FEE_STANDARD_TENTHS_BPS } from "@/lib/config";
import { staffFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** GET /api/admin/metrics?key=CRON_SECRET → the numbers that matter: funnel, trades per user, volume, retention. */
export async function GET(req: Request) {
  await ensureSchema();
  if (!(await staffFrom(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const one = async <T,>(q: SQL) => ((await db.execute(q)) as unknown as T[])[0];
  const [people, funnel, trades, volume, events, push, daily] = await Promise.all([
    one<{ total: number; today: number; week: number; guests: number }>(sql`
      select count(*)::int as total,
        count(*) filter (where created_at > now() - interval '1 day')::int as today,
        count(*) filter (where created_at > now() - interval '7 days')::int as week,
        count(*) filter (where id like 'guest:%')::int as guests
      from users where not is_bot`),
    one<{ cohort: number; traded: number; battled: number; returned: number }>(sql`
      with c as (select id, created_at from users where not is_bot and created_at > now() - interval '7 days')
      select count(*)::int as cohort,
        count(*) filter (where exists (select 1 from posts p where p.user_id = c.id and p.kind = 'trade'))::int as traded,
        count(*) filter (where exists (select 1 from battles b where b.fader_id = c.id or b.target_id = c.id))::int as battled,
        count(*) filter (where exists (select 1 from posts p where p.user_id = c.id and p.created_at > c.created_at + interval '1 day')
          or exists (select 1 from votes v where v.user_id = c.id and v.created_at > c.created_at + interval '1 day')
          or exists (select 1 from comments m where m.user_id = c.id and m.created_at > c.created_at + interval '1 day'))::int as returned
      from c`),
    one<{ today: number; traders_today: number; week: number; traders_week: number; fades_week: number; copies_week: number }>(sql`
      select count(*) filter (where p.created_at > now() - interval '1 day')::int as today,
        count(distinct p.user_id) filter (where p.created_at > now() - interval '1 day')::int as traders_today,
        count(*)::int as week, count(distinct p.user_id)::int as traders_week,
        count(*) filter (where p.faded_from_id is not null)::int as fades_week,
        count(*) filter (where p.copied_from_id is not null)::int as copies_week
      from posts p join users u on u.id = p.user_id
      where p.kind = 'trade' and not u.is_bot and p.created_at > now() - interval '7 days'`),
    one<{ real_today: number; real_week: number; demo_week: number }>(sql`
      select coalesce(sum(p.notional_usd) filter (where not p.paper and p.created_at > now() - interval '1 day'), 0)::float as real_today,
        coalesce(sum(p.notional_usd) filter (where not p.paper), 0)::float as real_week,
        coalesce(sum(p.notional_usd) filter (where p.paper), 0)::float as demo_week
      from posts p join users u on u.id = p.user_id
      where p.kind = 'trade' and not u.is_bot and p.created_at > now() - interval '7 days'`),
    one<{ visitors_today: number; visitors_week: number; intro_week: number; quickfade_week: number }>(sql`
      select count(distinct anon) filter (where name = 'visit' and created_at > now() - interval '1 day')::int as visitors_today,
        count(distinct anon) filter (where name = 'visit')::int as visitors_week,
        count(distinct anon) filter (where name = 'intro_done')::int as intro_week,
        count(*) filter (where name = 'quick_fade_open')::int as quickfade_week
      from events where created_at > now() - interval '7 days'`),
    one<{ devices: number; people: number }>(sql`select count(*)::int as devices, count(distinct user_id)::int as people from push_subs`),
    db.execute(sql`
      select to_char(d, 'Mon DD') as day,
        (select count(*) from users u where not u.is_bot and u.created_at >= d and u.created_at < d + interval '1 day')::int as signups,
        (select count(*) from posts p join users u on u.id = p.user_id where not u.is_bot and p.kind = 'trade' and p.created_at >= d and p.created_at < d + interval '1 day')::int as trades,
        (select count(distinct p.user_id) from posts p join users u on u.id = p.user_id where not u.is_bot and p.kind = 'trade' and p.created_at >= d and p.created_at < d + interval '1 day')::int as traders
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d order by d desc`),
  ]);
  const feeRate = (BUILDER_FEE_STANDARD_TENTHS_BPS / 100000) * 2; // open + close
  return Response.json({
    at: new Date().toISOString(),
    people, funnel, trades, volume, events, push,
    perTraderPerDay: trades && trades.traders_week ? +(trades.week / trades.traders_week / 7).toFixed(2) : 0,
    estFees: { today: +((volume?.real_today ?? 0) * feeRate).toFixed(2), week: +((volume?.real_week ?? 0) * feeRate).toFixed(2) },
    daily: Array.from(daily as unknown as Iterable<{ day: string; signups: number; trades: number; traders: number }>),
  });
}

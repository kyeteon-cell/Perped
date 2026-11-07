import { sql, type SQL } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { BUILDER_FEE_STANDARD_TENTHS_BPS } from "@/lib/config";
import { staffFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";
type Flow = { visitors: number; joined: number; linked: number; traded: number; faded: number; returned: number };

/** GET /api/admin/metrics?key=CRON_SECRET → the numbers that matter: funnel, trades per user, volume, retention. */
export async function GET(req: Request) {
  await ensureSchema();
  if (!(await staffFrom(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const one = async <T,>(q: SQL) => ((await db.execute(q)) as unknown as T[])[0];
  const [allTime] = (await db.execute(sql`
    select (select count(*) from users where not is_bot)::int as users,
      (select count(distinct p.user_id) from posts p join users u on u.id = p.user_id where not u.is_bot and p.kind = 'trade')::int as traders,
      (select count(*) from posts p join users u on u.id = p.user_id where not u.is_bot and p.kind = 'trade')::int as trades,
      (select count(distinct p.user_id) from posts p join users u on u.id = p.user_id where not u.is_bot and p.kind = 'trade' and p.faded_from_id is not null)::int as faders,
      (select count(distinct anon) from events where name = 'visit')::int as visitors`)) as unknown as Record<string, number>[];
  // Funnel v2 (last 7 days): visitors → joined → placed a trade → started a fade → came back another day.
  // "Started a fade" means they faded someone (being faded by a bot doesn't count), matching how the
  // competition counts an active user. "Came back" counts any later day they opened the app signed in.
  const flow = db.execute(sql`
    with c as (select id, created_at, id like 'guest:%' as guest from users where not is_bot and created_at > now() - interval '7 days')
    select
      (select count(distinct anon) from events where name = 'visit' and created_at > now() - interval '7 days')::int as visitors,
      count(*)::int as joined,
      count(*) filter (where not guest)::int as linked,
      count(*) filter (where exists (select 1 from posts p where p.user_id = c.id and p.kind = 'trade'))::int as traded,
      count(*) filter (where exists (select 1 from posts p where p.user_id = c.id and p.kind = 'trade' and p.faded_from_id is not null))::int as faded,
      count(*) filter (where exists (select 1 from events e where e.user_id = c.id and e.created_at::date > c.created_at::date)
        or exists (select 1 from posts p where p.user_id = c.id and p.created_at::date > c.created_at::date))::int as returned
    from c`);
  // Where they came from, by first-touch source. Joined/faded follow each person through their own signed-in pings.
  const sources = db.execute(sql`
    with v as (select coalesce(src, 'before tracking') as src, count(distinct anon)::int as visitors
               from events where name = 'visit' and created_at > now() - interval '7 days' group by 1),
         j as (select distinct on (e.user_id) e.user_id, coalesce(e.src, 'before tracking') as src
               from events e join users u on u.id = e.user_id
               where e.name = 'signed_in' and not u.is_bot and u.created_at > now() - interval '7 days'
               order by e.user_id, e.created_at),
         js as (select j.src, count(*)::int as joined,
                  count(*) filter (where exists (select 1 from posts p where p.user_id = j.user_id and p.kind = 'trade' and p.faded_from_id is not null))::int as faded
                from j group by 1)
    select coalesce(v.src, js.src) as src, coalesce(v.visitors, 0) as visitors, coalesce(js.joined, 0) as joined, coalesce(js.faded, 0) as faded
    from v full join js on js.src = v.src
    order by visitors desc, joined desc limit 10`);
  const [people, funnel, trades, volume, events, push, daily, flowRows, sourceRows] = await Promise.all([
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
    flow, sources,
  ]);
  const feeRate = (BUILDER_FEE_STANDARD_TENTHS_BPS / 100000) * 2; // open + close
  return Response.json({
    at: new Date().toISOString(),
    allTime, people, funnel, trades, volume, events, push,
    flow: (flowRows as unknown as Flow[])[0],
    sources: Array.from(sourceRows as unknown as Iterable<{ src: string; visitors: number; joined: number; faded: number }>),
    perTraderPerDay: trades && trades.traders_week ? +(trades.week / trades.traders_week / 7).toFixed(2) : 0,
    estFees: { today: +((volume?.real_today ?? 0) * feeRate).toFixed(2), week: +((volume?.real_week ?? 0) * feeRate).toFixed(2) },
    daily: Array.from(daily as unknown as Iterable<{ day: string; signups: number; trades: number; traders: number }>),
  });
}

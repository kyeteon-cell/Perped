import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { byHandle } from "@/lib/programme";
import { FOUNDER_GRACE_DAYS, FOUNDER_L2_PCT, founderL1Pct, isFounder, isStaff } from "@/lib/programme-rates";
import { getLiveSettings } from "@/lib/live";
import { referralLink } from "@/lib/fees";
import { APP_URL } from "@/lib/config";
import { rankFor } from "@/lib/rank";

export const dynamic = "force-dynamic";

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const n = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/founder[?handle=x] → a founder's dashboard: their seat, the people they brought in (and who those
 * people brought in), how active that network is, and what it has earned them. Founders see their own;
 * admins and the owner can open anyone's with ?handle=.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  const asked = new URL(req.url).searchParams.get("handle");
  const staff = isStaff(me.role);
  let u = me;
  if (asked && asked.toLowerCase().replace(/^@/, "") !== me.handle) {
    if (!staff) return Response.json({ error: "you can only see your own dashboard" }, { status: 403 });
    const other = await byHandle(asked);
    if (!other) return Response.json({ error: "no account with that handle" }, { status: 404 });
    u = other;
  }
  const founder = isFounder(u);
  if (!founder && !staff) return Response.json({ error: "not_founder" }, { status: 403 });

  const live = await getLiveSettings();
  const since14 = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
  const id = u.id;
  const [counts, daily, people, earned, paid, l2top] = await Promise.all([
    db.execute(sql`select
        (select count(*) from users where referred_by = ${id})::int as l1,
        (select count(*) from users where referred_by = ${id} and not is_demo)::int as l1_live,
        (select count(*) from users r where r.referred_by in (select m.id from users m where m.referred_by = ${id}))::int as l2,
        (select count(distinct p.user_id) from posts p join users r on r.id = p.user_id where r.referred_by = ${id} and p.kind = 'trade' and p.created_at > now() - interval '7 days')::int as active7,
        (select count(*) from posts p join users r on r.id = p.user_id where r.referred_by = ${id} and p.kind = 'trade' and p.created_at > now() - interval '7 days')::int as trades7,
        (select coalesce(sum(p.notional_usd),0) from posts p join users r on r.id = p.user_id where r.referred_by = ${id} and p.kind = 'trade' and p.created_at > now() - interval '7 days')::float as volume7,
        (select coalesce(sum(p.notional_usd),0) from posts p join users r on r.id = p.user_id where r.referred_by = ${id} and p.kind = 'trade' and not p.paper and p.created_at > now() - interval '7 days')::float as real_volume7,
        (select count(*) from users where referred_by = ${id} and created_at > now() - interval '7 days')::int as joined7,
        exists (select 1 from referral_earnings e where e.referrer_id = ${id} and e.kind = 'invite' and e.fills > 0) as secured`),
    db.execute(sql`select d::date::text as day,
        (select count(*) from users r where r.referred_by = ${id} and r.created_at::date = d::date)::int as joined,
        (select count(*) from posts p join users r on r.id = p.user_id where r.referred_by = ${id} and p.kind = 'trade' and p.created_at::date = d::date)::int as trades
      from generate_series(${since14}::date, now()::date, interval '1 day') d order by d`),
    db.execute(sql`select r.handle, r.avatar_url as "avatarUrl", r.is_demo as "isDemo", r.xp, r.created_at as "joinedAt",
        (select count(*) from users x where x.referred_by = r.id)::int as invited,
        (select count(*) from posts p where p.user_id = r.id and p.kind = 'trade')::int as trades,
        (select count(*) from posts p where p.user_id = r.id and p.kind = 'trade' and p.created_at > now() - interval '7 days')::int as trades7,
        (select max(p.created_at) from posts p where p.user_id = r.id) as "lastActive",
        coalesce((select sum(e.share_usd) from referral_earnings e where e.referee_id = r.id and e.referrer_id = ${id} and e.kind = 'invite'), 0)::float as earned
      from users r where r.referred_by = ${id} order by trades7 desc, trades desc, r.created_at desc limit 100`),
    db.execute(sql`select kind, coalesce(sum(share_usd),0)::float as total from referral_earnings where referrer_id = ${id} group by kind`),
    db.execute(sql`select coalesce(sum(amount_usd),0)::float as paid from referral_payouts where referrer_id = ${id}`),
    db.execute(sql`select r.handle, m.handle as via, (select count(*) from posts p where p.user_id = r.id and p.kind = 'trade')::int as trades
      from users r join users m on m.id = r.referred_by where m.referred_by = ${id} order by trades desc limit 10`),
  ]);
  const c = rows(counts)[0] ?? {};
  const bySrc = Object.fromEntries(rows(earned).map((r) => [String(r.kind), n(r.total)])) as Record<string, number>;
  const total = Object.values(bySrc).reduce((a, b) => a + b, 0);
  const paidUsd = n(rows(paid)[0]?.paid);

  // Grace clock: runs from the later of the seat date and the day real money opened; paused while closed.
  const graceStart = Math.max(u.founderSince ? new Date(u.founderSince).getTime() : Date.now(), live.open && live.openedAt ? new Date(live.openedAt).getTime() : Date.now());
  // Same test as the hourly seat expiry: someone they invited has actually traded real money.
  const secured = !!c.secured;
  const base = /localhost/.test(APP_URL) ? new URL(req.url).origin : APP_URL;
  const rank = rankFor(u.xp ?? 0);

  return Response.json({
    viewer: { staff, own: u.id === me.id },
    user: { handle: u.handle, avatarUrl: u.avatarUrl, xp: u.xp ?? 0, rank: rank.title, rankLevel: rank.level },
    founder: founder ? {
      seat: u.founderSeat, since: u.founderSince, status: u.founderStatus ?? "active", secured,
      l1Pct: founderL1Pct(u.founderSince), l2Pct: FOUNDER_L2_PCT, graceDays: FOUNDER_GRACE_DAYS,
      clock: secured ? "secured" : !live.open ? "paused" : "running",
      graceLeft: Math.max(0, FOUNDER_GRACE_DAYS - Math.floor((Date.now() - graceStart) / 86_400_000)),
    } : null,
    live: { open: live.open },
    link: referralLink(base, u.handle),
    network: {
      l1: n(c.l1), l1Live: n(c.l1_live), l2: n(c.l2), joined7: n(c.joined7),
      active7: n(c.active7), trades7: n(c.trades7), volume7: n(c.volume7), realVolume7: n(c.real_volume7),
    },
    earnings: { total, paid: paidUsd, owed: Math.max(0, total - paidUsd), invite: bySrc.invite ?? 0, invite2: bySrc.invite2 ?? 0, creator: bySrc.creator ?? 0 },
    daily: rows(daily).map((r) => ({ day: String(r.day), joined: n(r.joined), trades: n(r.trades) })),
    people: rows(people).map((r) => ({
      handle: String(r.handle), avatarUrl: (r.avatarUrl as string | null) ?? null, isDemo: !!r.isDemo, xp: n(r.xp), rank: rankFor(n(r.xp)).title,
      joinedAt: r.joinedAt, invited: n(r.invited), trades: n(r.trades), trades7: n(r.trades7), lastActive: r.lastActive ?? null, earned: n(r.earned),
    })),
    secondLevel: rows(l2top).map((r) => ({ handle: String(r.handle), via: String(r.via), trades: n(r.trades) })),
  });
}


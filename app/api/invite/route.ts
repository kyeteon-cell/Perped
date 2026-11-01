import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { APP_URL, REFERRAL_SHARE_PCT, REFERRAL_TOP_SHARE_PCT, REFERRAL_TOP_THRESHOLD } from "@/lib/config";
import { normaliseReferralCode, referralLink } from "@/lib/fees";
import { countActiveReferees } from "@/lib/referrals";
import { byHandle, canGoLive, nextRelease } from "@/lib/programme";
import { CREATOR_FOUNDER_PCT, CREATOR_PCT, CREATOR_RANKED_LEVEL, CREATOR_RANKED_PCT, FOUNDER_L1_LATER_PCT, FOUNDER_L1_PCT, FOUNDER_L2_PCT, FOUNDER_SEATS, FOUNDER_WAVE, FOUNDER_GRACE_DAYS, founderL1Ends, founderL1Pct, isFounder } from "@/lib/programme-rates";
import { RANKS, rankFor } from "@/lib/rank";
import { notify } from "@/lib/feed";
import { getLiveSettings } from "@/lib/live";

export const dynamic = "force-dynamic";

/** GET /api/invite → everything the invite page shows: link, rates, earnings by source, your people, recent creator earnings. */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const founder = isFounder(me);
  const live = await getLiveSettings();
  // Grace clock runs from the later of the seat date and the day real money opened; paused while closed.
  const graceStart = Math.max(me.founderSince ? new Date(me.founderSince).getTime() : Date.now(), live.open && live.openedAt ? new Date(live.openedAt).getTime() : Date.now());
  const [bySource, paid, people, people2, creator, active, inviter, counts] = await Promise.all([
    db.execute(sql`select kind, coalesce(sum(share_usd),0)::float as total, coalesce(sum(share_usd) filter (where day >= ${week}),0)::float as week from referral_earnings where referrer_id = ${me.id} group by kind`),
    db.execute(sql`select coalesce(sum(amount_usd),0)::float as paid from referral_payouts where referrer_id = ${me.id}`),
    db.select({
      handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, isDemo: schema.users.isDemo,
      invited: sql<number>`(select count(*) from users r where r.referred_by = "users"."id")`.mapWith(Number),
      volume: sql<number>`coalesce((select sum(volume_usd) from referral_earnings e where e.referee_id = "users"."id" and e.referrer_id = ${me.id} and e.kind = 'invite'), 0)`.mapWith(Number),
      earned: sql<number>`coalesce((select sum(share_usd) from referral_earnings e where e.referee_id = "users"."id" and e.referrer_id = ${me.id} and e.kind = 'invite'), 0)`.mapWith(Number),
    }).from(schema.users).where(eq(schema.users.referredBy, me.id)).orderBy(desc(sql`coalesce((select sum(share_usd) from referral_earnings e where e.referee_id = "users"."id" and e.referrer_id = ${me.id}), 0)`)).limit(60),
    founder ? db.execute(sql`select r.handle, r.avatar_url as "avatarUrl", m.handle as via,
        coalesce((select sum(volume_usd) from referral_earnings e where e.referee_id = r.id and e.kind = 'invite2' and e.referrer_id = ${me.id}), 0)::float as volume,
        coalesce((select sum(share_usd) from referral_earnings e where e.referee_id = r.id and e.kind = 'invite2' and e.referrer_id = ${me.id}), 0)::float as earned
      from users r join users m on m.id = r.referred_by where m.referred_by = ${me.id} order by earned desc limit 60`) : Promise.resolve([]),
    db.execute(sql`select e.day, u.handle, e.fills, e.volume_usd::float as volume, e.share_usd::float as earned from referral_earnings e join users u on u.id = e.referee_id
      where e.referrer_id = ${me.id} and e.kind = 'creator' order by e.day desc, e.share_usd desc limit 20`),
    countActiveReferees(me.id),
    me.referredBy ? db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, me.referredBy)).limit(1) : Promise.resolve([]),
    db.execute(sql`select count(*)::int as joined, count(*) filter (where not is_demo)::int as live,
      exists (select 1 from referral_earnings e where e.referrer_id = ${me.id} and e.kind = 'invite' and e.fills > 0) as secured from users where referred_by = ${me.id}`),
  ]);
  const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, number & string>[];
  const src = Object.fromEntries(rows(bySource).map((r) => [r.kind, { total: Number(r.total), week: Number(r.week) }])) as Record<string, { total: number; week: number }>;
  const earned = Object.values(src).reduce((a, s) => a + s.total, 0);
  const paidUsd = Number(rows(paid)[0]?.paid ?? 0);
  const rank = rankFor(me.xp ?? 0);
  const creatorPct = founder ? CREATOR_FOUNDER_PCT : rank.level >= CREATOR_RANKED_LEVEL ? CREATOR_RANKED_PCT : CREATOR_PCT;
  const ranked = RANKS.find((r) => r.level === CREATOR_RANKED_LEVEL)!;
  const c = rows(counts)[0] ?? { joined: 0, live: 0 };
  const base = /localhost/.test(APP_URL) ? new URL(req.url).origin : APP_URL;
  return Response.json({
    handle: me.handle,
    link: referralLink(base, me.handle),
    canGoLive: canGoLive(me),
    onWaitlist: !!me.waitlistAt && !canGoLive(me),
    nextRelease: nextRelease().toISOString(),
    invitedBy: (inviter as { handle: string }[])[0]?.handle ?? null,
    canRedeem: !me.referredBy && me.isDemo,
    founder: founder ? {
      seat: me.founderSeat, wave: FOUNDER_WAVE, seats: FOUNDER_SEATS, since: me.founderSince, l1Pct: founderL1Pct(me.founderSince), l1LaterPct: FOUNDER_L1_LATER_PCT, l1TopPct: FOUNDER_L1_PCT,
      l1Ends: me.founderSince ? founderL1Ends(me.founderSince).toISOString() : null, l2Pct: FOUNDER_L2_PCT, graceDays: FOUNDER_GRACE_DAYS,
      graceLeft: Math.max(0, FOUNDER_GRACE_DAYS - Math.floor((Date.now() - graceStart) / 86_400_000)), gracePaused: !live.open,
      secured: !!(c as Record<string, unknown>).secured,
    } : null,
    rates: {
      invitePct: founder ? founderL1Pct(me.founderSince) : (active >= REFERRAL_TOP_THRESHOLD ? REFERRAL_TOP_SHARE_PCT : REFERRAL_SHARE_PCT),
      baseInvitePct: REFERRAL_SHARE_PCT, topInvitePct: REFERRAL_TOP_SHARE_PCT, topThreshold: REFERRAL_TOP_THRESHOLD, activeInvites: active,
      creatorPct, creatorBasePct: CREATOR_PCT, creatorRankedPct: CREATOR_RANKED_PCT, creatorRankTitle: ranked.title, xpToRanked: Math.max(0, ranked.min - (me.xp ?? 0)),
    },
    counts: { joined: Number(c.joined), live: Number(c.live) },
    earnings: {
      owed: Math.max(0, earned - paidUsd), total: earned, paid: paidUsd,
      week: Object.values(src).reduce((a, s) => a + s.week, 0),
      invite: src.invite ?? { total: 0, week: 0 }, invite2: src.invite2 ?? { total: 0, week: 0 }, creator: src.creator ?? { total: 0, week: 0 },
    },
    people, people2: rows(people2), creator: rows(creator),
  });
}

/** POST /api/invite {code} → add an invite code after signing up (until your first real trade). Unlocks going live. */
export async function POST(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const c = normaliseReferralCode(code);
  if (!c) return Response.json({ error: "That code doesn't look right" }, { status: 400 });
  if (me.referredBy) return Response.json({ error: "You already joined with a code" }, { status: 409 });
  const [real] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, me.id), eq(schema.posts.kind, "trade"), eq(schema.posts.paper, false))).limit(1);
  if (real) return Response.json({ error: "Codes can only be added before your first real trade" }, { status: 409 });
  const ref = await byHandle(c);
  if (!ref || ref.isBot) return Response.json({ error: "No trader with that code" }, { status: 404 });
  if (ref.id === me.id || ref.referredBy === me.id) return Response.json({ error: "You can't use that code" }, { status: 400 });
  await db.update(schema.users).set({ referredBy: ref.id, referredAt: new Date(), canGoLive: true }).where(eq(schema.users.id, me.id));
  await notify(ref.id, "referral", `@${me.handle} joined with your code`, "You earn a share of the Perped fee on every real trade they make.", "/invite").catch(() => null);
  return Response.json({ ok: true, invitedBy: ref.handle });
}

import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { APP_URL, REFERRAL_SHARE_PCT, REFERRAL_TOP_SHARE_PCT, REFERRAL_TOP_THRESHOLD } from "@/lib/config";
import { referralLink } from "@/lib/fees";
import { getFeeInfo, getReferralSummary } from "@/lib/referrals";

/**
 * GET /api/referrals → the logged-in user's code, link, fee tier, earnings summary, referee list and payouts.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  if (!profile) return Response.json({ error: "no profile" }, { status: 404 });

  const [summary, fee, referees, payouts, referrer] = await Promise.all([
    getReferralSummary(profile.id),
    getFeeInfo(profile.id, profile.referredBy),
    db
      .select({
        handle: schema.users.handle,
        avatarUrl: schema.users.avatarUrl,
        joinedAt: schema.users.referredAt,
        earnedUsd: sql<number>`coalesce((select sum(share_usd) from referral_earnings e where e.referee_id = ${schema.users.id} and e.referrer_id = ${profile.id}), 0)`.mapWith(Number),
        volumeUsd: sql<number>`coalesce((select sum(volume_usd) from referral_earnings e where e.referee_id = ${schema.users.id} and e.kind = 'invite'), 0)`.mapWith(Number),
      })
      .from(schema.users)
      .where(eq(schema.users.referredBy, profile.id))
      .orderBy(desc(schema.users.referredAt))
      .limit(100),
    db.select().from(schema.referralPayouts).where(eq(schema.referralPayouts.referrerId, profile.id)).orderBy(desc(schema.referralPayouts.createdAt)).limit(20),
    profile.referredBy ? db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, profile.referredBy)).limit(1) : Promise.resolve([]),
  ]);

  return Response.json({
    code: profile.handle,
    link: referralLink(/localhost/.test(APP_URL) ? new URL(req.url).origin : APP_URL, profile.handle),
    referredBy: referrer[0]?.handle ?? null,
    fee,
    programme: { sharePct: REFERRAL_SHARE_PCT, topSharePct: REFERRAL_TOP_SHARE_PCT, topThreshold: REFERRAL_TOP_THRESHOLD },
    summary,
    referees,
    payouts,
  });
}

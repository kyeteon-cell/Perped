// Server-side referral + fee helpers (need the DB). Browser-safe maths lives in lib/fees.ts.
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { referralSharePct, resolveFeeTier, type FeeInfo } from "./fees";

/** Fee tier for a user, from their referral status and cached stats. */
export async function getFeeInfo(userId: string, referredBy: string | null): Promise<FeeInfo> {
  const [s] = await db
    .select({ rank30d: schema.stats.rank30d, closedTrades: schema.stats.closedTrades, realizedPnl30d: schema.stats.realizedPnl30d })
    .from(schema.stats)
    .where(eq(schema.stats.userId, userId))
    .limit(1);
  return resolveFeeTier({ referredBy, rank30d: s?.rank30d, closedTrades: s?.closedTrades, realizedPnl30d: s?.realizedPnl30d });
}

/** Referees of a user who had a live fill in the last 30 days (counted from referral_earnings). */
export async function countActiveReferees(referrerId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${schema.referralEarnings.refereeId})`.mapWith(Number) })
    .from(schema.referralEarnings)
    .where(and(eq(schema.referralEarnings.referrerId, referrerId), gte(schema.referralEarnings.day, since), sql`${schema.referralEarnings.fills} > 0`));
  return r?.n ?? 0;
}

export type ReferralSummary = {
  referees: number;
  activeReferees: number;
  sharePct: number;
  earnedUsd: number;
  paidUsd: number;
  owedUsd: number;
  last30dUsd: number;
};

export async function getReferralSummary(referrerId: string): Promise<ReferralSummary> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [[refs], [earn], [recent], [paid], active] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users).where(eq(schema.users.referredBy, referrerId)),
    db.select({ s: sql<number>`coalesce(sum(${schema.referralEarnings.shareUsd}), 0)`.mapWith(Number) }).from(schema.referralEarnings).where(eq(schema.referralEarnings.referrerId, referrerId)),
    db.select({ s: sql<number>`coalesce(sum(${schema.referralEarnings.shareUsd}), 0)`.mapWith(Number) }).from(schema.referralEarnings).where(and(eq(schema.referralEarnings.referrerId, referrerId), gte(schema.referralEarnings.day, since))),
    db.select({ s: sql<number>`coalesce(sum(${schema.referralPayouts.amountUsd}), 0)`.mapWith(Number) }).from(schema.referralPayouts).where(eq(schema.referralPayouts.referrerId, referrerId)),
    countActiveReferees(referrerId),
  ]);
  const earnedUsd = earn?.s ?? 0;
  const paidUsd = paid?.s ?? 0;
  return { referees: refs?.n ?? 0, activeReferees: active, sharePct: referralSharePct(active), earnedUsd, paidUsd, owedUsd: Math.max(0, earnedUsd - paidUsd), last30dUsd: recent?.s ?? 0 };
}

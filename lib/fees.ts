// Fee tiers and referral maths. Isomorphic: no DB, no secrets.
//
// Every live fill routed through Perped carries the builder code with a per-order fee `f`
// (tenths of a basis point). The user approves a single maximum once; we then charge at or
// below it depending on their tier. Referrers earn a share of the builder fee their referees pay.

import {
  BUILDER_FEE_REFERRED_TENTHS_BPS,
  BUILDER_FEE_STANDARD_TENTHS_BPS,
  BUILDER_FEE_TOP_TENTHS_BPS,
  BUILDER_MAX_FEE_TENTHS_BPS,
  REFERRAL_SHARE_PCT,
  REFERRAL_TOP_SHARE_PCT,
  REFERRAL_TOP_THRESHOLD,
  TOP_TIER_RANK,
} from "./config";

export type FeeTier = "standard" | "referred" | "top";

export type FeeInfo = {
  tier: FeeTier;
  /** Fee charged per fill, tenths of a basis point (50 = 0.05%). */
  tenthsBps: number;
  /** Max the user is asked to approve, tenths of a basis point. */
  maxTenthsBps: number;
  /** Human label like "0.035%". */
  label: string;
  /** Why they got this tier, for the settings screen. */
  reason: string;
};

export function tenthsBpsToLabel(t: number) {
  return `${(t / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function feeForTier(tier: FeeTier): number {
  const f = tier === "top" ? BUILDER_FEE_TOP_TENTHS_BPS : tier === "referred" ? BUILDER_FEE_REFERRED_TENTHS_BPS : BUILDER_FEE_STANDARD_TENTHS_BPS;
  return Math.min(f, BUILDER_MAX_FEE_TENTHS_BPS);
}

/**
 * Decide a user's tier. Top-100 needs a real track record so an empty leaderboard doesn't
 * hand everyone the cheapest tier: a rank inside TOP_TIER_RANK on 30-day PnL, 10+ closed
 * trades and positive 30-day PnL.
 */
export function resolveFeeTier(input: {
  referredBy?: string | null;
  rank30d?: number | null;
  closedTrades?: number | null;
  realizedPnl30d?: number | string | null;
}): FeeInfo {
  const rank = input.rank30d ?? 0;
  const closed = input.closedTrades ?? 0;
  const pnl = Number(input.realizedPnl30d ?? 0);
  let tier: FeeTier = "standard";
  let reason = "Standard rate.";
  if (rank > 0 && rank <= TOP_TIER_RANK && closed >= 10 && pnl > 0) {
    tier = "top";
    reason = `Top ${TOP_TIER_RANK} on the 30-day board.`;
  } else if (input.referredBy) {
    tier = "referred";
    reason = "Joined with a referral code.";
  }
  const tenthsBps = feeForTier(tier);
  return { tier, tenthsBps, maxTenthsBps: BUILDER_MAX_FEE_TENTHS_BPS, label: tenthsBpsToLabel(tenthsBps), reason };
}

/** Referrer's share of builder fees paid by their referees: 40% once they have enough active referees, else 25%. */
export function referralSharePct(activeReferees: number): number {
  return activeReferees >= REFERRAL_TOP_THRESHOLD ? REFERRAL_TOP_SHARE_PCT : REFERRAL_SHARE_PCT;
}

/** Referral codes are the user's handle; case-insensitive on input, shown upper-case. */
export function normaliseReferralCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9_]{3,20}$/.test(c) ? c : null;
}

export function referralLink(appUrl: string, handle: string) {
  return `${appUrl.replace(/\/$/, "")}/?ref=${handle}`;
}

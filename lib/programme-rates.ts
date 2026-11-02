/** Invite programme numbers (client-safe). Everything Perped pays out comes from builder fees already collected. */
export const FOUNDER_SEATS = 100;
export const FOUNDER_WAVE = 50; // seats open now; the rest are held back
export const FOUNDER_L1_PCT = 50; // of fees from people a founder invites, for life
export const FOUNDER_L2_PCT = 10; // of fees from people their invitees invite
export const FOUNDER_GRACE_DAYS = 60; // bring in a real-money trader within this or the seat goes back
export const CREATOR_PCT = 10; // of fees on fills that copy/fade your trade or trade your call
export const CREATOR_RANKED_PCT = 15; // from this rank level up
export const CREATOR_RANKED_LEVEL = 6; // Liquidator
export const CREATOR_FOUNDER_PCT = 20;
export const CREATOR_MIN_HOLD_S = 120;
export const PAYOUT_CAP_PCT = 70; // never pay out more than this share of any trader's fees

export type Role = "user" | "admin" | "owner";
export const isStaff = (role?: string | null) => role === "admin" || role === "owner";

/** A founder's invite rate: the same for life. */
export function founderL1Pct(_since?: Date | string | null) { return FOUNDER_L1_PCT; }
export const isFounder = (u: { founderSeat?: number | null; founderStatus?: string | null }) => u.founderSeat != null && u.founderStatus !== "expired";

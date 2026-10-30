// Central app config, read once from env. Everything NEXT_PUBLIC_* is safe for the browser.

export type HlNetwork = "testnet" | "mainnet";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Perped";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const HL_NETWORK: HlNetwork =
  (process.env.NEXT_PUBLIC_HL_NETWORK as HlNetwork) === "mainnet" ? "mainnet" : "testnet";

export const HL_API_URL =
  HL_NETWORK === "mainnet" ? "https://api.hyperliquid.xyz" : "https://api.hyperliquid-testnet.xyz";

export const HL_WS_URL =
  HL_NETWORK === "mainnet" ? "wss://api.hyperliquid.xyz/ws" : "wss://api.hyperliquid-testnet.xyz/ws";

// Market data (prices, candles, volume, funding) always comes from mainnet unless overridden, so the
// feed shows real prices even while trading runs on testnet. User state and orders use HL_NETWORK.
export const HL_DATA_NETWORK: HlNetwork =
  (process.env.NEXT_PUBLIC_HL_DATA_NETWORK as HlNetwork) === "testnet" ? "testnet" : "mainnet";
export const HL_DATA_API_URL =
  HL_DATA_NETWORK === "mainnet" ? "https://api.hyperliquid.xyz" : "https://api.hyperliquid-testnet.xyz";
export const HL_DATA_WS_URL =
  HL_DATA_NETWORK === "mainnet" ? "wss://api.hyperliquid.xyz/ws" : "wss://api.hyperliquid-testnet.xyz/ws";

// Hyperliquid signs against chain id 42161 (Arbitrum) on mainnet and 421614 on testnet
// for user-signed actions such as ApproveBuilderFee.
export const HL_SIGNATURE_CHAIN_ID = HL_NETWORK === "mainnet" ? 42161 : 421614;

export const BUILDER_ADDRESS = (process.env.NEXT_PUBLIC_BUILDER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// ---- Builder fee tiers, all in tenths of a basis point (50 = 5 bp = 0.05%). Perps cap is 100 (0.1%). ----
// Users approve BUILDER_MAX once; we charge the tier rate (always <= the max) per order.
export const BUILDER_MAX_FEE_TENTHS_BPS = clampInt(Number(process.env.NEXT_PUBLIC_BUILDER_MAX_FEE_TENTHS_BPS ?? 70), 0, 100);
export const BUILDER_FEE_STANDARD_TENTHS_BPS = clampInt(Number(process.env.NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS ?? 50), 0, BUILDER_MAX_FEE_TENTHS_BPS);
export const BUILDER_FEE_REFERRED_TENTHS_BPS = clampInt(Number(process.env.NEXT_PUBLIC_BUILDER_FEE_REFERRED_TENTHS_BPS ?? 35), 0, BUILDER_MAX_FEE_TENTHS_BPS);
export const BUILDER_FEE_TOP_TENTHS_BPS = clampInt(Number(process.env.NEXT_PUBLIC_BUILDER_FEE_TOP_TENTHS_BPS ?? 25), 0, BUILDER_MAX_FEE_TENTHS_BPS);
/** Leaderboard rank (30-day PnL) at or above which a trader gets the top tier. */
export const TOP_TIER_RANK = clampInt(Number(process.env.NEXT_PUBLIC_TOP_TIER_RANK ?? 100), 1, 10_000);

/** Kept for back-compat: the standard rate. New code should use lib/fees.ts. */
export const BUILDER_FEE_TENTHS_BPS = BUILDER_FEE_STANDARD_TENTHS_BPS;

// The string Hyperliquid expects when a user approves a max builder fee, e.g. "0.07%".
export const BUILDER_MAX_FEE_RATE = `${(BUILDER_MAX_FEE_TENTHS_BPS / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;

// ---- Referral programme ----
/** Share of a referee's builder fees paid to the referrer (percent). */
export const REFERRAL_SHARE_PCT = clampInt(Number(process.env.NEXT_PUBLIC_REFERRAL_SHARE_PCT ?? 25), 0, 100);
/** Higher share once a referrer has REFERRAL_TOP_THRESHOLD referees who traded in the last 30 days. */
export const REFERRAL_TOP_SHARE_PCT = clampInt(Number(process.env.NEXT_PUBLIC_REFERRAL_TOP_SHARE_PCT ?? 40), 0, 100);
export const REFERRAL_TOP_THRESHOLD = clampInt(Number(process.env.NEXT_PUBLIC_REFERRAL_TOP_THRESHOLD ?? 10), 1, 100_000);

/** Fallback only, used before market data loads. The real cap is each market's own max leverage on Hyperliquid. */
export const MAX_LEVERAGE = clampInt(Number(process.env.NEXT_PUBLIC_MAX_LEVERAGE ?? 50), 1, 100);
export const MAX_POSITION_USD = Math.max(10, Number(process.env.NEXT_PUBLIC_MAX_POSITION_USD ?? 500));

export const BUILDER_CONFIGURED =
  BUILDER_ADDRESS.toLowerCase() !== "0x0000000000000000000000000000000000000000";

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Demo mode availability. "0" hides demo from onboarding and settings and refuses paper trades (existing demo users get switched live on next settings save). */
export const DEMO_ENABLED = (process.env.NEXT_PUBLIC_DEMO_ENABLED ?? "1") !== "0";

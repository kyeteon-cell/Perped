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

// Hyperliquid signs against chain id 42161 (Arbitrum) on mainnet and 421614 on testnet
// for user-signed actions such as ApproveBuilderFee.
export const HL_SIGNATURE_CHAIN_ID = HL_NETWORK === "mainnet" ? 42161 : 421614;

export const BUILDER_ADDRESS = (process.env.NEXT_PUBLIC_BUILDER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Tenths of a basis point. 50 = 5 bp = 0.05%. Perps cap is 100 (0.1%).
export const BUILDER_FEE_TENTHS_BPS = clampInt(
  Number(process.env.NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS ?? 50),
  0,
  100,
);

// The string Hyperliquid expects when a user approves a max builder fee, e.g. "0.05%".
export const BUILDER_MAX_FEE_RATE = `${(BUILDER_FEE_TENTHS_BPS / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;

export const MAX_LEVERAGE = clampInt(Number(process.env.NEXT_PUBLIC_MAX_LEVERAGE ?? 5), 1, 50);
export const MAX_POSITION_USD = Math.max(10, Number(process.env.NEXT_PUBLIC_MAX_POSITION_USD ?? 500));

export const BUILDER_CONFIGURED =
  BUILDER_ADDRESS.toLowerCase() !== "0x0000000000000000000000000000000000000000";

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Demo mode availability. "0" hides demo from onboarding and settings and refuses paper trades (existing demo users get switched live on next settings save). */
export const DEMO_ENABLED = (process.env.NEXT_PUBLIC_DEMO_ENABLED ?? "1") !== "0";

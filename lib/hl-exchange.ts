"use client";

// Signed Hyperliquid "exchange" actions, run in the browser with the user's Privy embedded wallet.
// Uses @nktkas/hyperliquid for action hashing + EIP-712 signing so we never hand-roll msgpack.
// SDK docs: https://github.com/nktkas/hyperliquid

import * as hl from "@nktkas/hyperliquid";
import type { WalletClient } from "viem";
import {
  BUILDER_ADDRESS,
  BUILDER_CONFIGURED,
  BUILDER_FEE_TENTHS_BPS,
  BUILDER_MAX_FEE_RATE,
  HL_NETWORK,
  HL_SIGNATURE_CHAIN_ID,
} from "./config";
import { fmtPx, fmtSize, roundSize } from "./format";
import type { PerpAsset } from "./hl-info";

const isTestnet = HL_NETWORK === "testnet";

export function makeExchangeClient(wallet: WalletClient) {
  const transport = new hl.HttpTransport({ isTestnet });
  // Older SDK versions take `isTestnet`, newer ones derive the chain from `signatureChainId`.
  // Passing both keeps us compatible across minor versions.
  return new hl.ExchangeClient({
    wallet,
    transport,
    isTestnet,
    signatureChainId: `0x${HL_SIGNATURE_CHAIN_ID.toString(16)}`,
  } as unknown as ConstructorParameters<typeof hl.ExchangeClient>[0]);
}

export type MarketOrderInput = {
  asset: PerpAsset;
  side: "long" | "short";
  /** Position notional in USD. */
  usd: number;
  /** Current mid price. */
  mid: number;
  leverage: number;
  /** Max slippage from mid, e.g. 0.03 = 3%. */
  slippage?: number;
  /** When true, reduces an existing position instead of opening. */
  reduceOnly?: boolean;
  /** Override size (used when closing). */
  size?: number;
  /** "market" (IOC at mid ± slippage) or "limit" (GTC at limitPx). */
  orderType?: "market" | "limit";
  limitPx?: number;
  /** Optional take-profit / stop-loss trigger prices; placed with the entry as a normalTpsl group. */
  takeProfitPx?: number;
  stopLossPx?: number;
};

export type OrderResult = {
  ok: boolean;
  oid?: number;
  avgPx?: number;
  totalSz?: number;
  error?: string;
  raw?: unknown;
};

/**
 * Place a "market" order on Hyperliquid: an IOC limit at mid ± slippage.
 * Attaches the builder code when the app has one configured.
 */
export async function placeMarketOrder(client: hl.ExchangeClient, input: MarketOrderInput): Promise<OrderResult> {
  const { asset, side, usd, mid, leverage, slippage = 0.03, reduceOnly = false, orderType = "market", limitPx, takeProfitPx, stopLossPx } = input;
  const isBuy = side === "long";

  // Set leverage first (cross). Ignore failures — the order still goes through at current leverage.
  try {
    await client.updateLeverage({ asset: asset.index, isCross: true, leverage });
  } catch {
    /* non-fatal */
  }

  const rawSize = input.size ?? usd / mid;
  const sz = roundSize(rawSize, asset.szDecimals);
  if (sz <= 0) return { ok: false, error: `Size too small for ${asset.name} (min step ${1 / 10 ** asset.szDecimals})` };

  const px = orderType === "limit" && limitPx ? limitPx : isBuy ? mid * (1 + slippage) : mid * (1 - slippage);
  const sizeStr = fmtSize(sz, asset.szDecimals);

  const entry = {
    a: asset.index,
    b: isBuy,
    p: fmtPx(px, asset.szDecimals),
    s: sizeStr,
    r: reduceOnly,
    t: { limit: { tif: (orderType === "limit" ? "Gtc" : "Ioc") as "Gtc" | "Ioc" } },
  };

  // TP/SL are reduce-only trigger orders on the opposite side, executed as market orders when hit.
  const exits: Record<string, unknown>[] = [];
  const trigger = (triggerPx: number, tpsl: "tp" | "sl") => ({
    a: asset.index,
    b: !isBuy,
    p: fmtPx(isBuy ? triggerPx * (1 - 0.05) : triggerPx * (1 + 0.05), asset.szDecimals), // worst acceptable fill
    s: sizeStr,
    r: true,
    t: { trigger: { isMarket: true, triggerPx: fmtPx(triggerPx, asset.szDecimals), tpsl } },
  });
  if (!reduceOnly && takeProfitPx && takeProfitPx > 0) exits.push(trigger(takeProfitPx, "tp"));
  if (!reduceOnly && stopLossPx && stopLossPx > 0) exits.push(trigger(stopLossPx, "sl"));

  const params: Record<string, unknown> = { orders: [entry, ...exits], grouping: exits.length ? "normalTpsl" : "na" };
  if (BUILDER_CONFIGURED && BUILDER_FEE_TENTHS_BPS > 0) {
    params.builder = { b: BUILDER_ADDRESS.toLowerCase(), f: BUILDER_FEE_TENTHS_BPS };
  }

  try {
    const res = (await client.order(params as Parameters<hl.ExchangeClient["order"]>[0])) as unknown as {
      status: string;
      response?: { data?: { statuses?: Array<Record<string, unknown>> } };
    };
    const status = res.response?.data?.statuses?.[0] ?? {};
    if ("error" in status) return { ok: false, error: String(status.error), raw: res };
    const filled = (status.filled ?? status.resting) as { oid?: number; avgPx?: string; totalSz?: string } | undefined;
    return {
      ok: true,
      oid: filled?.oid,
      avgPx: filled?.avgPx ? Number(filled.avgPx) : undefined,
      totalSz: filled?.totalSz ? Number(filled.totalSz) : sz,
      raw: res,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Close an entire position with a reduce-only IOC order. */
export async function closePosition(
  client: hl.ExchangeClient,
  asset: PerpAsset,
  signedSize: number,
  mid: number,
): Promise<OrderResult> {
  const side: "long" | "short" = signedSize > 0 ? "short" : "long"; // opposite side to close
  return placeMarketOrder(client, {
    asset,
    side,
    usd: Math.abs(signedSize) * mid,
    mid,
    leverage: 1,
    reduceOnly: true,
    size: Math.abs(signedSize),
    slippage: 0.05,
  });
}

/**
 * Ask the user to approve our builder fee (one signature, revocable, max 10 builders per account).
 * Must be signed by the user's main wallet, which is what the Privy embedded wallet is.
 */
export async function approveBuilderFee(client: hl.ExchangeClient) {
  if (!BUILDER_CONFIGURED) throw new Error("No builder address configured");
  return client.approveBuilderFee({ builder: BUILDER_ADDRESS.toLowerCase() as `0x${string}`, maxFeeRate: BUILDER_MAX_FEE_RATE as `${string}%` });
}

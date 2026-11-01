// The maths that decides who won, who got liquidated and what everyone pays. If one of these breaks, real money is wrong.
import { describe, expect, it } from "vitest";
import { autoStopDist, demoLiqPx, normCoin, pnlForPosition } from "@/lib/format";
import { BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS } from "@/lib/config";
import { feeForTier, normaliseReferralCode, resolveFeeTier, tenthsBpsToLabel } from "@/lib/fees";

describe("P&L", () => {
  it("long makes money when price rises", () => {
    const r = pnlForPosition("long", 100, 110, 2);
    expect(r.pnl).toBeCloseTo(20);
    expect(r.pct).toBeCloseTo(10);
  });
  it("short makes money when price falls", () => {
    const r = pnlForPosition("short", 100, 90, 3);
    expect(r.pnl).toBeCloseTo(30);
    expect(r.pct).toBeCloseTo(10);
  });
  it("long and short are exact opposites", () => {
    const l = pnlForPosition("long", 64_000, 63_100, 0.5), s = pnlForPosition("short", 64_000, 63_100, 0.5);
    expect(l.pnl).toBeCloseTo(-s.pnl);
  });
  it("never divides by zero", () => {
    expect(pnlForPosition("long", 0, 10, 1).pct).toBe(0);
  });
});

describe("Liquidation and auto-stop", () => {
  it("demo liquidation is 1/leverage away from entry", () => {
    expect(demoLiqPx("long", 100, 10)).toBeCloseTo(90);
    expect(demoLiqPx("short", 100, 10)).toBeCloseTo(110);
    expect(demoLiqPx("long", 100, 40)).toBeCloseTo(97.5);
  });
  it("fade auto-stop always sits inside liquidation", () => {
    for (const lev of [1, 2, 3, 5, 10, 20, 25, 40, 50]) {
      const stop = autoStopDist(lev), liq = 1 / lev;
      expect(stop).toBeGreaterThan(0);
      expect(stop).toBeLessThan(liq);
    }
  });
  it("auto-stop is never tighter than a 1% move unless liquidation is closer", () => {
    expect(autoStopDist(5)).toBeCloseTo(0.02); // 10% of margin at 5x
    expect(autoStopDist(40)).toBeCloseTo(0.01); // floor
  });
});

describe("Market names", () => {
  it("keeps the lower-case k on 1000x markets", () => {
    expect(normCoin("kPEPE")).toBe("kPEPE");
    expect(normCoin("kBONK")).toBe("kBONK");
  });
  it("upper-cases normal coins, including ones that start with K", () => {
    expect(normCoin("btc")).toBe("BTC");
    expect(normCoin("KAITO")).toBe("KAITO");
    expect(normCoin("kaito")).toBe("KAITO");
    expect(normCoin(" eth ")).toBe("ETH");
  });
});

describe("Fees", () => {
  it("tiers never exceed the max the user approves", () => {
    for (const t of ["standard", "referred", "top"] as const) expect(feeForTier(t)).toBeLessThanOrEqual(BUILDER_MAX_FEE_TENTHS_BPS);
  });
  it("standard, referral and top tiers resolve correctly", () => {
    expect(resolveFeeTier({}).tenthsBps).toBe(Math.min(BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS));
    expect(resolveFeeTier({ referredBy: "u1" }).tier).toBe("referred");
    expect(resolveFeeTier({ referredBy: "u1" }).tenthsBps).toBe(Math.min(BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS));
    expect(resolveFeeTier({ rank30d: 5, closedTrades: 12, realizedPnl30d: 50 }).tier).toBe("top");
    expect(resolveFeeTier({ rank30d: 5, closedTrades: 12, realizedPnl30d: 50 }).tenthsBps).toBe(Math.min(BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS));
  });
  it("top tier needs a real record: 10+ trades and positive P&L", () => {
    expect(resolveFeeTier({ rank30d: 1, closedTrades: 3, realizedPnl30d: 500 }).tier).toBe("standard");
    expect(resolveFeeTier({ rank30d: 1, closedTrades: 30, realizedPnl30d: -1 }).tier).toBe("standard");
  });
  it("labels read as percentages", () => {
    expect(tenthsBpsToLabel(50)).toMatch(/0\.05%/);
  });
  it("referral codes are handles, case-insensitive", () => {
    expect(normaliseReferralCode("@Kilo")).toBe("kilo");
    expect(normaliseReferralCode("no spaces")).toBeNull();
    expect(normaliseReferralCode("")).toBeNull();
  });
});

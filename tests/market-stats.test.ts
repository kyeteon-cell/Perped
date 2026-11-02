import { describe, it, expect } from "vitest";
import { depthWithin, slippage, median, liqDistancePct, typicalDay } from "../lib/market-stats";

const book = {
  bids: [{ px: 99.9, sz: 10 }, { px: 99.5, sz: 10 }, { px: 98, sz: 100 }],
  asks: [{ px: 100.1, sz: 10 }, { px: 100.5, sz: 10 }, { px: 102.5, sz: 100 }],
};

describe("market stats", () => {
  it("sums depth inside the band and knows when the book reaches past it", () => {
    const d = depthWithin(book, 100, 0.5);
    expect(d.bids).toBeCloseTo(999 + 995);
    expect(d.asks).toBeCloseTo(1001 + 1005);
    expect(d.full).toBe(true);
    expect(depthWithin(book, 100, 5).full).toBe(false);
  });
  it("walks the book for market-order slippage", () => {
    // $1001 buy fills entirely at 100.1 → 0.1% above mid
    expect(slippage(book.asks, 100, 1001, "buy")).toBeCloseTo(0.1);
    // too big for the book shown
    expect(slippage(book.asks, 100, 1e9, "buy")).toBeNull();
    expect(slippage(book.bids, 100, 999, "sell")).toBeCloseTo(0.1);
  });
  it("median, liquidation distance and typical day", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // 10x on a 25x-max market: 10% initial − 2% maintenance
    expect(liqDistancePct(10, 25)).toBeCloseTo(8);
    const t = typicalDay([{ o: 100, h: 104, l: 98 }, { o: 100, h: 102, l: 97 }, { o: 100, h: 103, l: 99 }]);
    expect(t.rangePct).toBeCloseTo(5);
    expect(t.upPct).toBeCloseTo(3);
    expect(t.downPct).toBeCloseTo(2);
  });
});

import { fundingVerdict, fundingDot, flowVerdict, depthVerdict, premiumVerdict, marketRead } from "../lib/market-read";
describe("market read", () => {
  it("judges funding against resting rate and the coin's own range", () => {
    expect(fundingVerdict(0.01, -0.01, 0.02)).toBe("Normal");
    expect(fundingVerdict(0.02, -0.01, 0.05)).toBe("Above normal");
    expect(fundingVerdict(0.04, -0.01, 0.035)).toBe("Longs crowded");
    expect(fundingVerdict(0.04, -0.01, 0.06)).toBe("Above normal"); // normal for this coin
    expect(fundingVerdict(-0.01, -0.03, 0.02)).toBe("Shorts pay");
    expect(fundingVerdict(-0.05, -0.03, 0.02)).toBe("Shorts crowded");
    expect(fundingDot(0.01)).toBeCloseTo(50);
  });
  it("flow, depth, premium and the summary", () => {
    expect(flowVerdict(47)).toBe("Balanced");
    expect(flowVerdict(65)).toBe("Buyers heavy");
    expect(depthVerdict(0.004)).toBe("Deep");
    expect(depthVerdict(null)).toBe("Thin");
    expect(premiumVerdict(-0.035)).toBe("In line");
    const r = marketRead({ funding: "Normal", flow: "Balanced", depth: "Deep", todayPct: 0.5, typicalPct: 3.3 });
    expect(r.head).toBe("Calm and balanced.");
    expect(r.body).toBe("Cheap to hold either way, deep enough that size won't move it, and today is a normal day so far.");
  });
});

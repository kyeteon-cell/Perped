// Demo stop-loss / take-profit / liquidation: wicks count, fills land at the level, gaps fill at the open.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/trades", () => ({ closeTradePost: vi.fn() }));
import { findTrigger } from "@/lib/demo-stops";

const T0 = Date.UTC(2026, 10, 5, 17, 33, 5);
const at = (min: number, o: number, h: number, l: number) => ({ t: Math.floor(T0 / 60_000) * 60_000 + min * 60_000, o, h, l });
const short = { side: "short", entryPx: "76117.5", leverage: 40, slPx: "76307.8", tpPx: null, createdAt: new Date(T0) } as const;
const long = { side: "long", entryPx: "100", leverage: 10, slPx: "98", tpPx: "103", createdAt: new Date(T0) } as const;

describe("findTrigger", () => {
  it("catches a wick through the stop and fills at the stop", () => {
    expect(findTrigger(short, [at(1, 76120, 76350, 76100)], 76150)).toEqual({ reason: "sl", px: 76307.8 });
  });
  it("ignores the entry minute's range (it may predate the trade)", () => {
    expect(findTrigger(short, [at(0, 76100, 76400, 76100)], 76150)).toBeNull();
  });
  it("fills at the open when price gaps past the stop", () => {
    expect(findTrigger(short, [at(3, 76500, 76550, 76450)], 76500)).toEqual({ reason: "sl", px: 76500 });
  });
  it("stop wins when stop and target share a candle", () => {
    expect(findTrigger(long, [at(1, 100, 104, 97)], 100)).toEqual({ reason: "sl", px: 98 });
  });
  it("fills take profit at the target", () => {
    expect(findTrigger(long, [at(1, 100, 104, 99)], 100)).toEqual({ reason: "tp", px: 103 });
  });
  it("liquidates without a stop", () => {
    expect(findTrigger({ ...long, slPx: null, tpPx: null }, [at(1, 100, 100, 89)], 95)).toEqual({ reason: "liquidation", px: 90 });
  });
  it("falls back to the live price when candles are missing", () => {
    expect(findTrigger(short, [], 76310)?.reason).toBe("sl");
    expect(findTrigger(short, [], 76200)).toBeNull();
  });
});

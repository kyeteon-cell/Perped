import { describe, expect, it } from "vitest";
import { withLive } from "../lib/candles-live";

const c = (t: number, o: number, h: number, l: number, cl: number) => ({ t, o, h, l, c: cl, v: 1 });

describe("withLive", () => {
  it("updates the forming candle with the live price", () => {
    const out = withLive([c(0, 10, 11, 9, 10)], 12, 60_000, 30_000);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ o: 10, h: 12, l: 9, c: 12 });
  });
  it("opens a new candle when the last period has ended", () => {
    const out = withLive([c(0, 10, 11, 9, 10)], 8, 60_000, 130_000);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ t: 120_000, o: 10, h: 10, l: 8, c: 8 });
  });
  it("leaves candles alone without a live price", () => {
    const arr = [c(0, 10, 11, 9, 10)];
    expect(withLive(arr, 0, 60_000)).toBe(arr);
    expect(withLive([], 5, 60_000)).toEqual([]);
  });
});

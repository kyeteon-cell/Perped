import { describe, expect, it } from "vitest";
import { PUSH_TITLE_MAX, fitPush, seriesLine } from "@/lib/push-copy";

describe("Push copy", () => {
  it("keeps short titles and never sends a title longer than the lock screen shows", () => {
    expect(fitPush("tp", "Take profit hit on SOL", "Closed long").title).toBe("Take profit hit on SOL");
    const long = fitPush("rival", "Your rival mooncat just went long SOL 10×", "Series 3–2. Tap to quick fade.");
    expect(long.title.length).toBeLessThanOrEqual(PUSH_TITLE_MAX);
    expect(long.body).toContain("mooncat just went long SOL 10×");
  });
  it("uses the crafted headline, and splits it when a long handle pushes it over", () => {
    expect(fitPush("rival", "x", "y", { title: "@mooncat: Long SOL 10×", body: "Your rival just opened a trade. Series: you lead 3–2. Tap to fade it." })).toEqual({ title: "@mooncat: Long SOL 10×", body: "Your rival just opened a trade.\nSeries: you lead 3–2.\nTap to fade it." });
    const r = fitPush("rival", "x", "y", { title: "@contrarian_kate_longname: Short DOGE 10×", body: "Your rival just opened." });
    expect(r.title).toBe("@contrarian_kate_longname");
    expect(r.body).toBe("Short DOGE 10×.\nYour rival just opened.");
  });
  it("never splits decimals or prices across lines", () => {
    expect(fitPush("battle", "x", undefined, { title: "Won", body: "WIF fade: you +12.4%, them −3.1%. Tap to pin it." }).body).toBe("WIF fade: you +12.4%, them −3.1%.\nTap to pin it.");
  });
  it("describes a series from your side", () => {
    expect(seriesLine(3, 2)).toBe("you lead 3–2");
    expect(seriesLine(1, 4)).toBe("they lead 4–1");
    expect(seriesLine(2, 2)).toBe("level at 2–2");
  });
});

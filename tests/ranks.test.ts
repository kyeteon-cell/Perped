// Ranks, XP penalties and founder rates: what people see on their profile and what founders get paid.
import { describe, expect, it } from "vitest";
import { RANKS, lossPenalty, rankFor } from "@/lib/rank";
import { FOUNDER_L1_LATER_PCT, FOUNDER_L1_PCT, founderL1Pct, isFounder, isStaff } from "@/lib/programme-rates";
import { isAdminBadge, isFounderBadge } from "@/lib/badges";

describe("Ranks", () => {
  it("start at the first rank and climb with XP", () => {
    expect(rankFor(0).level).toBe(1);
    expect(rankFor(RANKS[1].min).level).toBe(2);
    expect(rankFor(RANKS[RANKS.length - 1].min + 1_000_000).level).toBe(RANKS[RANKS.length - 1].level);
  });
  it("progress stays between 0 and 1", () => {
    for (const xp of [0, 10, 249, 250, 5_000, 1e9]) {
      const r = rankFor(xp);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
  });
  it("losses are free below Knife Catcher and cost more higher up", () => {
    expect(lossPenalty(3, "battle")).toBe(0);
    expect(lossPenalty(4, "battle")).toBeLessThan(0);
    expect(lossPenalty(6, "battle")).toBeLessThan(lossPenalty(4, "battle"));
    expect(lossPenalty(5, "liquidation")).toBeLessThan(lossPenalty(5, "duel"));
  });
});

describe("Founders and staff", () => {
  it("founders get the higher rate for the first year, then the later rate", () => {
    expect(founderL1Pct(new Date())).toBe(FOUNDER_L1_PCT);
    const old = new Date(); old.setFullYear(old.getFullYear() - 2);
    expect(founderL1Pct(old)).toBe(FOUNDER_L1_LATER_PCT);
  });
  it("an expired seat is not a founder", () => {
    expect(isFounder({ founderSeat: 3, founderStatus: "active" })).toBe(true);
    expect(isFounder({ founderSeat: 3, founderStatus: "expired" })).toBe(false);
    expect(isFounder({ founderSeat: null })).toBe(false);
  });
  it("badges follow role and seat", () => {
    expect(isStaff("owner") && isStaff("admin") && !isStaff("user")).toBe(true);
    expect(isAdminBadge({ role: "owner" })).toBe(true);
    expect(isAdminBadge({ role: "user" })).toBe(false);
    expect(isFounderBadge({ founderSeat: 1, founderStatus: "active" })).toBe(true);
    expect(isFounderBadge({ founderSeat: 1, founderStatus: "expired" })).toBe(false);
  });
});

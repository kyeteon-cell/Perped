/** Ranks (client-safe). XP is earned from battles, duels, calls and closed trades. From Knife Catcher up, losses cost XP and ranks can be lost. */

export const RANKS = [
  { level: 1, title: "Paper Hands", min: 0 },
  { level: 2, title: "Degen", min: 250 },
  { level: 3, title: "Wick Hunter", min: 800 },
  { level: 4, title: "Knife Catcher", min: 2_000 },
  { level: 5, title: "Whale Fader", min: 4_500 },
  { level: 6, title: "Liquidator", min: 9_000 },
  { level: 7, title: "Market Maker", min: 16_000 },
  { level: 8, title: "Perpetrator", min: 30_000 },
] as const;

export type Rank = (typeof RANKS)[number];

export function rankFor(xp: number) {
  let r: Rank = RANKS[0];
  for (const x of RANKS) if (xp >= x.min) r = x;
  const next = RANKS.find((x) => x.min > r.min) ?? null;
  const span = next ? next.min - r.min : 1;
  return { ...r, xp, next, progress: next ? Math.min(1, (xp - r.min) / span) : 1, toNext: next ? next.min - xp : 0 };
}

/** XP per event. Battles pay the most; a bigger margin of victory pays more. Values are deliberately modest. */
export const XP = {
  battleWin: 60, battleWinBigMargin: 30, // + when you beat them by 20% ROI or more
  battleLoss: 10, battleDraw: 20, battleLiquidatedLoss: 0,
  upsetBonus: 40, // beating someone two or more ranks above you
  duelWin: 75, duelLoss: 10,
  callHit: 6, callMiss: 2,
  tradeWin: 4, tradeLoss: 1, liquidation: 0,
} as const;

/**
 * From Knife Catcher (level 4) up, losing costs XP, and the cost grows with rank. Ranks can be lost.
 * Returns a negative number (or 0 below level 4).
 */
export function lossPenalty(level: number, kind: "battle" | "duel" | "liquidation") {
  if (level < 4) return 0;
  const steps = level - 3; // L4 → 1, L5 → 2, …
  const base = kind === "liquidation" ? 25 : kind === "battle" ? 15 : 10;
  return -base * steps;
}

export const XP_REASON_LABEL: Record<string, string> = {
  battle_win: "Won a battle", battle_loss: "Lost a battle", battle_draw: "Drew a battle",
  duel_win: "Won a duel", duel_loss: "Lost a duel",
  call_hit: "Call hit", call_miss: "Call missed",
  trade_win: "Profitable trade", trade_loss: "Losing trade", liquidation: "Liquidated", season_start: "Season start",
};

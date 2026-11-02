/** Alert groups (client-safe). Every alert still lands in your notifications; these only decide what pushes to your phone. */
export const ALERT_GROUPS = [
  { key: "fades", label: "Fades", desc: "Someone fades you, lead changes, results, rival trades", types: ["faded", "battle", "lead", "rival", "fade_summary"] },
  { key: "trades", label: "Your trades", desc: "Stop loss, take profit, liquidation, copies, settled fades on your trades", types: ["tp", "sl", "stop", "liquidation", "copied", "settled"] },
  { key: "calls", label: "Calls and duels", desc: "Your calls hit or miss, duel results", types: ["call_hit", "call_missed", "duel"] },
  { key: "progress", label: "Ranks, trophies and picks", desc: "Rank ups, trophies, winning picks, your weekly recap", types: ["rank", "achievement", "pick", "recap"] },
  { key: "social", label: "People", desc: "New followers, replies, friends joining on your code", types: ["follow", "reply", "referral"] },
] as const;
export type AlertGroup = (typeof ALERT_GROUPS)[number]["key"];
export type AlertPrefs = Partial<Record<AlertGroup, boolean>>;
export function groupOf(type: string): AlertGroup | null {
  for (const g of ALERT_GROUPS) if ((g.types as readonly string[]).includes(type)) return g.key;
  return null;
}
/** Push is on unless you've turned that group off. */
export const wantsPush = (prefs: AlertPrefs | null | undefined, type: string) => { const g = groupOf(type); return !g || prefs?.[g] !== false; };

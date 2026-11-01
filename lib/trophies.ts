// Trophies (client-safe): the catalog and the emblem art. The emblems are drawn here as SVG so they work
// everywhere: in the app, in notifications and on share cards (drawn onto a canvas).

export type Tier = "bronze" | "silver" | "gold" | "obsidian";
export type Motif = "drop" | "bolt" | "copy" | "shield" | "target" | "hourglass" | "flame" | "dagger" | "bag" | "skull" | "pillar"
  | "buoy" | "glove" | "swords" | "rocket" | "diamond" | "check" | "megaphone" | "crosshair" | "eye" | "crown" | "people" | "zero";

export type Trophy = {
  key: string; name: string; tier: Tier; desc: string; motif: Motif;
  /** Which metric drives it and the target (for progress bars on locked trophies). */
  metric: string; goal: number; badge?: string;
  group: "Starter" | "Fights" | "Trading" | "Social" | "Special";
};

export const TROPHIES: Trophy[] = [
  { key: "first_blood", name: "First Blood", tier: "bronze", desc: "Make your first trade.", motif: "drop", metric: "trades", goal: 1, group: "Starter" },
  { key: "contrarian", name: "Contrarian", tier: "bronze", desc: "Fade someone for the first time.", motif: "bolt", metric: "fades", goal: 1, group: "Starter" },
  { key: "copycat", name: "Copycat", tier: "bronze", desc: "Copy someone's trade for the first time.", motif: "copy", metric: "copies", goal: 1, group: "Starter" },
  { key: "safety_first", name: "Safety First", tier: "bronze", desc: "Open a trade with a stop loss.", motif: "shield", metric: "stopTrades", goal: 1, group: "Starter" },
  { key: "called_it", name: "Called It", tier: "bronze", desc: "Land your first call.", motif: "target", metric: "callsHit", goal: 1, group: "Starter" },
  { key: "survivor", name: "Survivor", tier: "bronze", desc: "Hold a trade for 24 hours without getting liquidated.", motif: "hourglass", metric: "held24", goal: 1, group: "Starter" },
  { key: "sniper", name: "Sniper", tier: "bronze", desc: "Close a trade at +100% ROI or more.", motif: "crosshair", metric: "bestRoi", goal: 100, group: "Trading" },

  { key: "hat_trick", name: "Hat Trick", tier: "silver", desc: "Win 3 fades in a row.", motif: "flame", metric: "bestStreak", goal: 3, badge: "3", group: "Fights" },
  { key: "rampage", name: "Rampage", tier: "gold", desc: "Win 5 fades in a row.", motif: "flame", metric: "bestStreak", goal: 5, badge: "5", group: "Fights" },
  { key: "untouchable", name: "Untouchable", tier: "obsidian", desc: "Win 10 fades in a row.", motif: "flame", metric: "bestStreak", goal: 10, badge: "10", group: "Fights" },
  { key: "giant_slayer", name: "Giant Slayer", tier: "gold", desc: "Beat someone two or more ranks above you.", motif: "dagger", metric: "upsets", goal: 1, group: "Fights" },
  { key: "bounty_hunter", name: "Bounty Hunter", tier: "gold", desc: "Break someone's streak of 5 or more wins.", motif: "bag", metric: "bounties", goal: 1, group: "Fights" },
  { key: "executioner", name: "Executioner", tier: "silver", desc: "Win a fade by getting your opponent liquidated.", motif: "skull", metric: "liqWins", goal: 1, group: "Fights" },
  { key: "last_standing", name: "Last Standing", tier: "silver", desc: "Win a fade as the one still in after the other side closed.", motif: "pillar", metric: "lastStandWins", goal: 1, group: "Fights" },
  { key: "comeback_kid", name: "Comeback Kid", tier: "gold", desc: "Win a fade after being 50% or more down.", motif: "buoy", metric: "comebacks", goal: 1, group: "Fights" },
  { key: "fight_night", name: "Fight Night Champion", tier: "gold", desc: "Win 3 fades started in the same Fight Night.", motif: "glove", metric: "fightNightBest", goal: 3, group: "Fights" },
  { key: "blood_feud", name: "Blood Feud", tier: "obsidian", desc: "Lead a rivalry by 5 wins.", motif: "swords", metric: "rivalLead", goal: 5, group: "Fights" },

  { key: "double_up", name: "Double Up", tier: "silver", desc: "Close a trade at +250% ROI or more.", motif: "rocket", metric: "bestRoi", goal: 250, group: "Trading" },
  { key: "moonshot", name: "Moonshot", tier: "gold", desc: "Close a trade at +500% ROI or more.", motif: "rocket", metric: "bestRoi", goal: 500, badge: "5×", group: "Trading" },
  { key: "ten_bagger", name: "Ten Bagger", tier: "obsidian", desc: "Close a trade at +1,000% ROI or more.", motif: "diamond", metric: "bestRoi", goal: 1000, badge: "10×", group: "Trading" },
  { key: "clean_sheet", name: "Clean Sheet", tier: "silver", desc: "Close 10 trades in a row at 5× or more without a liquidation.", motif: "check", metric: "cleanRun", goal: 10, group: "Trading" },
  { key: "diamond_hands", name: "Diamond Hands", tier: "gold", desc: "Hold a winning trade for 7 days.", motif: "diamond", metric: "held7Win", goal: 1, group: "Trading" },

  { key: "influencer", name: "Influencer", tier: "silver", desc: "Get copied 10 times.", motif: "megaphone", metric: "copied", goal: 10, group: "Social" },
  { key: "idol", name: "Idol", tier: "gold", desc: "Get copied 100 times.", motif: "megaphone", metric: "copied", goal: 100, badge: "100", group: "Social" },
  { key: "most_wanted", name: "Most Wanted", tier: "gold", desc: "Get faded 25 times.", motif: "target", metric: "faded", goal: 25, group: "Social" },
  { key: "oracle", name: "Oracle", tier: "silver", desc: "Land 10 calls.", motif: "eye", metric: "callsHit", goal: 10, group: "Social" },
  { key: "prophet", name: "Prophet", tier: "gold", desc: "Hit 70% or more of at least 20 calls.", motif: "crown", metric: "prophet", goal: 1, group: "Social" },
  { key: "recruiter", name: "Recruiter", tier: "silver", desc: "Bring in 5 people who trade.", motif: "people", metric: "recruits", goal: 5, group: "Social" },
  { key: "kingmaker", name: "Kingmaker", tier: "gold", desc: "Bring in 25 people who trade.", motif: "crown", metric: "recruits", goal: 25, badge: "25", group: "Social" },

  { key: "season_zero", name: "Season 0", tier: "obsidian", desc: "Traded on Perped before real money opened.", motif: "zero", metric: "season0", goal: 1, group: "Special" },
];
export const TROPHY = Object.fromEntries(TROPHIES.map((t) => [t.key, t])) as Record<string, Trophy>;
export const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", obsidian: "Obsidian" };
export const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, obsidian: 4 };

// ---------- emblem art ----------
const M: Record<Motif, string> = {
  drop: `<path d="M12 3.2C9.4 7 6.4 10.3 6.4 14.1a5.6 5.6 0 0 0 11.2 0C17.6 10.3 14.6 7 12 3.2z" fill="currentColor"/>`,
  bolt: `<path d="M13.2 2.8 5.5 13.4h5.6l-.9 7.8 7.8-10.7h-5.7l.9-7.7z" fill="currentColor"/>`,
  copy: `<rect x="8" y="8" width="11" height="11" rx="2.2"/><path d="M5 15.5V6.2C5 5.5 5.5 5 6.2 5h9.3"/>`,
  shield: `<path d="M12 3l7 2.8v5.4c0 4.6-3 8.2-7 9.8-4-1.6-7-5.2-7-9.8V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>`,
  hourglass: `<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5"/><path d="M9.6 18.5h4.8L12 15.5z" fill="currentColor" stroke="none"/>`,
  flame: `<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.2 3.4-8.3.3 1.9 1.3 3 2.4 3.6C11 7 12.3 4.6 14.6 3c-.4 2.9.9 4.8 2.3 6.6 1 1.3 1.6 2.9 1.6 4.8C18.5 18.2 15.9 21 12 21z" fill="currentColor"/>`,
  dagger: `<path d="M12 2.5l2 3v8.5h-4V5.5z" fill="currentColor"/><path d="M7.5 14h9M12 14v4.2M10.6 18.2h2.8l-.4 3.3h-2z"/>`,
  bag: `<path d="M9.2 3.5h5.6l-1.6 3.2h-2.4z"/><path d="M10.8 6.7C6.4 8.3 4.5 12 4.5 15c0 3.6 3 5.5 7.5 5.5s7.5-1.9 7.5-5.5c0-3-1.9-6.7-6.3-8.3"/><path d="M13.8 11.2c-.4-.7-1.1-1-1.9-1-1.2 0-2 .6-2 1.5 0 2.1 4.2 1.2 4.2 3.4 0 .9-.9 1.6-2.2 1.6-.9 0-1.7-.4-2.1-1.1M12 9.2v1M12 16.7v1"/>`,
  skull: `<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.3 2.8 5.3V19a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5v-3.2c1.5-1 2.8-2.7 2.8-5.3A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11.2" r="1.8" fill="currentColor" stroke="none"/><circle cx="15" cy="11.2" r="1.8" fill="currentColor" stroke="none"/><path d="M10.2 20.5v-2M13.8 20.5v-2"/>`,
  pillar: `<path d="M5 20.5h14M6.5 18h11M7.5 18V7M16.5 18V7M12 18V7M5.5 7h13L12 3.5z"/>`,
  buoy: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M6 6l3.4 3.4M18 6l-3.4 3.4M6 18l3.4-3.4M18 18l-3.4-3.4"/>`,
  glove: `<path d="M7 11.5V8a5 5 0 0 1 5-5h1.5A4.5 4.5 0 0 1 18 7.5v4.2a5.3 5.3 0 0 1-2.2 4.3L15 16.6V20a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1v-3.6A6 6 0 0 1 5 11.6 2 2 0 0 1 7 11.5z"/><path d="M7 11.5c1.6 0 2.8 1.1 2.8 2.6M10 8.5h5"/>`,
  swords: `<path d="M4 4l9.5 9.5M4 4h3.2l8.6 8.6M4 4v3.2l8.6 8.6"/><path d="M20 4l-9.5 9.5M20 4h-3.2l-3.6 3.6M20 4v3.2l-3.6 3.6"/><path d="M11.6 14.8l-2.4 2.4M7.4 15.6l3 3M14.8 12.4l2.4 2.4M13.6 16.6l3-3"/>`,
  rocket: `<path d="M12 2.8c3 2.2 4.6 5.6 4.6 9.4v3.6H7.4v-3.6c0-3.8 1.6-7.2 4.6-9.4z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M7.4 13.5l-2.6 2.8v2.4l2.6-1.3M16.6 13.5l2.6 2.8v2.4l-2.6-1.3M10 18.5l2 3 2-3"/>`,
  diamond: `<path d="M6.5 4h11l3.5 5-9 11.5L3 9z"/><path d="M3 9h18M9 4l3 16.5L15 4M8.5 9 12 4l3.5 5"/>`,
  check: `<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.4"/>`,
  megaphone: `<path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1zM7 15l1.2 4.5h2.3L9.6 15M18.5 9.5a3.5 3.5 0 0 1 0 5"/>`,
  crosshair: `<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>`,
  eye: `<path d="M2.8 12S6.2 5.5 12 5.5 21.2 12 21.2 12 17.8 18.5 12 18.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>`,
  crown: `<path d="M3.5 8.5l4.2 3.6L12 5.5l4.3 6.6 4.2-3.6-1.7 9.5H5.2zM5.6 20.5h12.8" fill="currentColor"/>`,
  people: `<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.4-3.1 2.6-5 5.5-5s5.1 1.9 5.5 5"/><path d="M15.2 5.6a3 3 0 0 1 0 5.8M17.4 14.7c1.8.5 2.9 2.2 3.1 4.8"/>`,
  zero: `<ellipse cx="12" cy="12" rx="5.6" ry="8"/><path d="M8.2 17.5 15.8 6.5"/>`,
};

const PAL: Record<Tier, { hi: string; mid: string; lo: string; ink: string; glow: string }> = {
  bronze: { hi: "#ffd8ad", mid: "#c27a3e", lo: "#5e3315", ink: "#ffcf9e", glow: "#c27a3e" },
  silver: { hi: "#ffffff", mid: "#b9c1cb", lo: "#59616c", ink: "#eef2f6", glow: "#b9c1cb" },
  gold: { hi: "#fff3c2", mid: "#f2b63a", lo: "#8a5b00", ink: "#ffe08a", glow: "#f2b63a" },
  obsidian: { hi: "#c9b8ff", mid: "#6b4fd8", lo: "#120d22", ink: "#d9ccff", glow: "#8b6cff" },
};

/** Rim shape per tier: bronze round, silver hexagon, gold sunburst, obsidian shield. */
function rim(tier: Tier) {
  if (tier === "bronze") return `<circle cx="60" cy="60" r="54"/>`;
  if (tier === "silver") return `<path d="M60 5l47.6 27.5v55L60 115 12.4 87.5v-55z"/>`;
  if (tier === "gold") {
    const pts: string[] = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 50 : 57; pts.push(`${(60 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`); }
    return `<polygon points="${pts.join(" ")}"/>`;
  }
  return `<path d="M60 3l50 16v38c0 30-21 50-50 61C31 107 10 87 10 57V19z"/>`;
}

/** The emblem as an SVG string (120×120). Locked ones come out grey. */
export function emblemSvg(t: Pick<Trophy, "key" | "tier" | "motif" | "badge">, locked = false) {
  const p = locked ? { hi: "#d7dbe0", mid: "#8b929b", lo: "#3b4047", ink: "#9aa1aa", glow: "#000" } : PAL[t.tier];
  const id = `e${t.key}${locked ? "l" : ""}`;
  const badge = t.badge ? `<g><rect x="${60 - (t.badge.length * 7 + 10) / 2}" y="84" width="${t.badge.length * 7 + 10}" height="18" rx="9" fill="${p.lo}" stroke="${p.hi}" stroke-width="1.5"/><text x="60" y="97.5" text-anchor="middle" font-family="Barlow, system-ui, sans-serif" font-weight="900" font-size="13" fill="${p.hi}">${t.badge}</text></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<defs>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.hi}"/><stop offset=".45" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>
<radialGradient id="${id}d" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#2a2f37"/><stop offset="1" stop-color="#0b0c0e"/></radialGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<g fill="url(#${id}r)">${rim(t.tier)}</g>
<circle cx="60" cy="60" r="40" fill="url(#${id}d)" stroke="${p.lo}" stroke-width="2"/>
<circle cx="60" cy="60" r="36" fill="none" stroke="${p.mid}" stroke-opacity=".5" stroke-width="1"/>
<g transform="translate(34 32) scale(2.15)" fill="none" stroke="${p.ink}" color="${p.ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${M[t.motif]}</g>
<ellipse cx="60" cy="38" rx="30" ry="14" fill="url(#${id}s)" opacity=".35"/>
${badge}
</svg>`;
}
export const emblemUrl = (t: Pick<Trophy, "key" | "tier" | "motif" | "badge">, locked = false) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvg(t, locked))}`;

import { chromium } from "playwright";
const BASE = process.env.BASE, SHARE = process.env.SHARE, OUT = process.env.OUT || "/vercel/shots/out";
const av = (h) => `/api/share-bg/bot-${h}`;
const owner = { handle: "kye", avatarUrl: av("samui_sam"), role: "owner", founderSeat: null, founderStatus: null };
const board = [
  { slug: "kilo-klips", name: "Kilo Klips", tag: "KILO", bio: null, owner, members: 48, pnl7d: 18420, wins: 31, losses: 12, score: 19, rank: 1 },
  { slug: "wall-st-bets-247", name: "Wall St 24/7", tag: "WS247", bio: null, owner: { handle: "wallst_wes", avatarUrl: av("wallst_wes"), role: null, founderSeat: 7, founderStatus: "active" }, members: 31, pnl7d: 9210, wins: 22, losses: 11, score: 11, rank: 2 },
  { slug: "tendies-gang", name: "Tendies Gang", tag: "TNDY", bio: null, owner: { handle: "tendies_tina", avatarUrl: av("tendies_tina"), role: null, founderSeat: 12, founderStatus: "active" }, members: 64, pnl7d: -3120, wins: 27, losses: 24, score: 3, rank: 3 },
  { slug: "wick-hunters", name: "Wick Hunters", tag: "WICK", bio: null, owner: { handle: "wickhunter", avatarUrl: av("wickhunter"), role: null, founderSeat: null, founderStatus: null }, members: 12, pnl7d: 2210, wins: 8, losses: 9, score: -1, rank: 4 },
  { slug: "fade-club", name: "Fade Club", tag: "FADE", bio: null, owner: { handle: "contrarian_kate", avatarUrl: av("contrarian_kate"), role: null, founderSeat: 3, founderStatus: "active" }, members: 19, pnl7d: -880, wins: 6, losses: 10, score: -4, rank: 5 },
];
const mem = (h, o) => ({ handle: h, avatarUrl: av(h === "kye" ? "samui_sam" : h), xp: 4200, isDemo: true, role: h === "kye" ? "owner" : null, founderSeat: null, founderStatus: null, joinedAt: "2026-11-01", isOwner: h === "kye", ...o });
const detail = {
  crew: { ...board[0], bio: "Solana memes and HYPE perps. Calls with receipts, fades on sight.", rank: 1, telegram: null, tgMembers: false },
  members: [
    mem("kye", { pnl7d: 6200, pnl30d: 21400, winRate: 61, closedTrades: 142, weekWins: 9, weekLosses: 3 }),
    mem("degenmaxi", { pnl7d: 4100, pnl30d: 12800, winRate: 54, closedTrades: 210, weekWins: 7, weekLosses: 4 }),
    mem("samui_sam", { pnl7d: 2900, pnl30d: 8400, winRate: 58, closedTrades: 96, weekWins: 5, weekLosses: 2 }),
    mem("mooncat", { pnl7d: -900, pnl30d: 2100, winRate: 47, closedTrades: 77, weekWins: 3, weekLosses: 2 }),
    mem("fundingfarmer", { pnl7d: 1200, pnl30d: -1600, winRate: 51, closedTrades: 64, weekWins: 4, weekLosses: 1 }),
  ],
  viewer: { member: true, isOwner: true, otherCrew: null }, owner: { invitePct: 50 }, referredFeeBps: 3.5, telegram: { available: true, bot: "PerpedBot" },
};
const rec = { address: "0xa6e2dc44418f5ad213c86db4dbb203a59d13c49f", pnlAll: 733891, pnl30d: -279785, pnl7d: -66899, volumeAll: 3520356385, volume30d: 141218647, accountValue: 408595, since: 1701906300001, closes: 1260, wins: 504, winRate: 40, best: { coin: "BTC", pnl: 22277, time: 0 }, worst: null, topCoins: [{ coin: "BTC", volume: 1 }, { coin: "PUMP", volume: 1 }, { coin: "SOL", volume: 1 }, { coin: "HYPE", volume: 1 }], updatedAt: Date.now() };
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem("perped:welcomed", "1"); localStorage.setItem("perped:intro", "done"); } catch {} });
const page = await ctx.newPage();
await page.goto(`${BASE}/?_vercel_share=${SHARE}`); await page.waitForTimeout(1500);
await page.route("**/api/crews", (r) => json(r, { board, mine: { slug: "kilo-klips", name: "Kilo Klips", tag: "KILO", isOwner: true }, weekEndsAt: new Date(Date.now() + 3.4 * 86400e3).toISOString() }));
await page.route("**/api/crews/kilo-klips", (r) => json(r, detail));
const tags = ["KILO", "WS247", "TNDY", "KILO", "FADE"];
await page.route("**/api/posts?*", async (r) => {
  const res = await r.fetch(); const b = await res.json().catch(() => null);
  if (b?.posts) b.posts.forEach((p, i) => { if (p.author) p.author.crew = { slug: "kilo-klips", tag: tags[i % tags.length] }; });
  return json(r, b);
});
await page.route("**/api/profile/*", async (r) => {
  const res = await r.fetch(); const b = await res.json().catch(() => null);
  if (b?.user) { b.crew = { slug: "kilo-klips", name: "Kilo Klips", tag: "KILO", isOwner: false }; b.hlRecord = rec; }
  return json(r, b);
});
const shot = async (path, name, prep) => { await page.goto(`${BASE}${path}`); await page.waitForTimeout(3500); if (prep) await prep(); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log("shot", name); };
await shot("/crews", "1_crews");
await shot("/crew/kilo-klips", "2_crew_owner");
await shot("/leaderboard", "3_leaders_crews", async () => { await page.getByRole("button", { name: "Crews" }).click(); await page.waitForTimeout(1200); });
await shot("/u/degenmaxi", "4_profile_record");
await shot("/", "5_feed_tags");
await browser.close();

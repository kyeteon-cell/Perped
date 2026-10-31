import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { fadeBlockReason } from "./fades";
import { alertRivals } from "./rivalries";
import { getMids, getPerpAssets } from "./hl-info";
import { notify, systemPost } from "./feed";

/** Six demo traders with distinct styles. They are flagged isDemo + isBot and never touch Hyperliquid. */
export const BOTS = [
  { id: "bot:samui_sam", handle: "samui_sam", bio: "Swing trades on the majors. Takes profit early, posts the losses too.", coins: ["BTC", "ETH", "SOL"], lev: [5, 15], style: "mid" as const, bias: 0.6, winSkew: 0.62, chatty: 0.6, calls: 0.25, holdH: [6, 48] },
  { id: "bot:degenmaxi", handle: "degenmaxi", bio: "Max leverage or nothing. Here for a good time, not a long time.", coins: ["SOL", "DOGE", "WIF", "HYPE"], lev: [20, 50], style: "degen" as const, bias: 0.5, winSkew: 0.42, chatty: 0.9, calls: 0.1, holdH: [1, 8] },
  { id: "bot:fundingfarmer", handle: "fundingfarmer", bio: "I trade the funding rate, not the chart. Calls > trades.", coins: ["BTC", "ETH", "HYPE", "XRP"], lev: [2, 5], style: "low" as const, bias: 0.5, winSkew: 0.58, chatty: 0.4, calls: 0.6, holdH: [12, 72] },
  { id: "bot:wickhunter", handle: "wickhunter", bio: "Liquidity grabs and failed breakouts. Stops always on.", coins: ["SOL", "ETH", "SUI", "LINK"], lev: [10, 25], style: "high" as const, bias: 0.45, winSkew: 0.6, chatty: 0.5, calls: 0.3, holdH: [2, 24] },
  { id: "bot:contrarian_kate", handle: "contrarian_kate", bio: "If everyone's long, I'm short. Fading is a lifestyle.", coins: ["BTC", "SOL", "DOGE"], lev: [5, 20], style: "mid" as const, bias: 0.3, winSkew: 0.52, chatty: 0.7, calls: 0.2, holdH: [4, 36], fader: true },
  { id: "bot:mooncat", handle: "mooncat", bio: "New here. Learning in public. Be nice.", coins: ["DOGE", "WIF", "SOL"], lev: [10, 50], style: "degen" as const, bias: 0.7, winSkew: 0.4, chatty: 0.8, calls: 0.05, holdH: [1, 12] },
];

const NOTES_OPEN = ["Clean break of the range. Stop below the wick.", "Funding flipped, taking the other side.", "Scalp, not a marriage.", "Daily close above resistance. Sizing small.", "Reclaimed the level. Let's see.", "Mean reversion play. Tight stop.", "No thesis, vibes. Don't copy this.", "Second attempt at this level, first one got perped.", "HTF trend is up, buying the dip.", "Weekend liquidity is thin, careful."];
const NOTES_CLOSE_WIN = ["Banked. Never going broke taking a win.", "Target hit. Next.", "Half off here, letting the rest run.", "That'll do.", "Paid for lunch."];
const NOTES_CLOSE_LOSS = ["Got perped. Stop did its job.", "Wrong. Small loss, moving on.", "Chopped. Should've waited for the close.", "Taking the L before it becomes a bigger L.", "Invalidation hit, out."];
const COMMENTS = ["Same setup I'm watching.", "Stop's too tight imo", "copied at your entry, pray for me", "This aged well", "fading this 🫡", "size?", "Funding says otherwise", "Nice one", "Why 5×", "respect for posting the loss", "calling it now: this reverses at the daily open", "👀"];

const REPLIES_OWN = ["Still holding. Thesis unchanged.", "Fair point, but I'm sticking with it.", "Moved my stop to entry.", "If it loses the level I'm out.", "Size is small, relax.", "Told you 😌", "Yeah that one hurt.", "Reply in receipts, not comments."];
const DUEL_LINES = ["Let's settle this on the chart.", "Put your size where your mouth is.", "You've faded me twice. Duel.", "Opposite sides, same coin, 48 hours."];
const POLLS = [["Does BTC close the week green?", ["Yes", "No"], "BTC", "gte"], ["ETH above {px} in 3 days?", ["Yes", "No"], "ETH", "gte"], ["SOL back below {px} by Friday?", ["Yes", "No"], "SOL", "lte"]] as const;

/** Max leverage per coin on Hyperliquid, cached per run. */
let maxLevCache: Record<string, number> | null = null;
async function maxLevMap() {
  if (maxLevCache) return maxLevCache;
  try { maxLevCache = Object.fromEntries((await getPerpAssets()).map((a) => [a.name, a.maxLeverage])); } catch { maxLevCache = {}; }
  return maxLevCache;
}

/**
 * Leverage a bot uses on a coin. Degens run the market's maximum most of the time (that's the point:
 * big numbers in the feed); "high" sits in the upper half; "mid" and "low" stay sensible with the
 * occasional max send for the leaderboard.
 */
function pickLev(b: { lev: [number, number] | number[]; style?: "degen" | "high" | "mid" | "low" }, coin: string, maxMap: Record<string, number>) {
  const max = Math.max(2, maxMap[coin] ?? 20);
  const r = Math.random();
  switch (b.style) {
    case "degen": return r < 0.8 ? max : Math.round(rnd(max * 0.5, max));
    case "high": return r < 0.35 ? max : Math.round(rnd(max * 0.4, max));
    case "low": return r < 0.05 ? max : Math.round(rnd(Math.min(b.lev[0], max), Math.min(b.lev[1], max)));
    default: return r < 0.15 ? max : Math.round(rnd(Math.min(b.lev[0], max), Math.min(b.lev[1], max)));
  }
}

/** 0..1 how alike two bots are: shared coins and similar leverage. Drives who follows whom. */
function similarity(a: (typeof BOTS)[number], b: (typeof BOTS)[number]) {
  const shared = a.coins.filter((c) => b.coins.includes(c)).length / Math.max(a.coins.length, b.coins.length);
  const levGap = Math.min(1, Math.abs((a.lev[0] + a.lev[1]) / 2 - (b.lev[0] + b.lev[1]) / 2) / 40);
  return Math.max(0, shared * 0.7 + (1 - levGap) * 0.3);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hours = (h: number) => h * 3_600_000;

export async function ensureBots() {
  for (const b of BOTS) {
    await db.insert(schema.users).values({ id: b.id, address: `0xdemo${b.handle.padEnd(35, "0").slice(0, 35)}`, handle: b.handle, bio: b.bio, avatarUrl: `/api/share-bg/bot-${b.handle}`, isDemo: true, isBot: true, demoBalance: "10000", verified: false })
      .onConflictDoNothing();
    await db.insert(schema.stats).values({ userId: b.id }).onConflictDoNothing();
  }
  // follow graph: bots follow the bots most like them (shared coins, similar leverage), plus a little randomness
  for (const a of BOTS) for (const b of BOTS) if (a !== b && Math.random() < 0.25 + similarity(a, b) * 0.7) await db.insert(schema.follows).values({ followerId: a.id, followeeId: b.id }).onConflictDoNothing();
}

/** Backfill ~2 weeks of closed trades, a few open ones, calls, polls, comments and votes. */
export async function seedHistory() {
  const mids = await getMids();
  const maxMap = await maxLevMap();
  const now = Date.now();
  const created: number[] = [];
  for (const b of BOTS) {
    for (let i = 0; i < 7; i++) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (!mid) continue;
      const side = Math.random() < b.bias ? "long" : "short";
      const lev = pickLev(b, coin, maxMap);
      const openedAt = now - hours(rnd(24, 24 * 14));
      const hold = hours(rnd(b.holdH[0], b.holdH[1]));
      const win = Math.random() < b.winSkew;
      const move = rnd(0.5, 6) / 100 * (win ? 1 : -1) * (side === "long" ? 1 : -1);
      const entry = mid / (1 + move * rnd(0.8, 1.2));
      const exit = mid * (1 + rnd(-0.004, 0.004));
      const margin = pick([100, 250, 500, 750, 1000, 2000]);
      const notional = margin * lev, size = notional / entry;
      const pnl = (side === "long" ? exit - entry : entry - exit) * size;
      const [p] = await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin, side, size: String(size), notionalUsd: String(notional), leverage: lev, entryPx: String(entry), status: "closed", exitPx: String(exit), realizedPnl: pnl.toFixed(4), closedAt: new Date(openedAt + hold), paper: true, body: pick(NOTES_OPEN), createdAt: new Date(openedAt), meta: { closeReason: !win && lev >= 4 && Math.random() < 0.3 ? "liquidation" : "manual" } }).returning({ id: schema.posts.id });
      created.push(p.id);
    }
    // one or two open trades
    for (let i = 0; i < 1 + Math.round(Math.random()); i++) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (!mid) continue;
      const side = Math.random() < b.bias ? "long" : "short";
      const lev = pickLev(b, coin, maxMap);
      const entry = mid * (1 + rnd(-0.02, 0.02));
      const margin = pick([100, 250, 500, 1000]);
      const notional = margin * lev;
      const [p] = await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin, side, size: String(notional / entry), notionalUsd: String(notional), leverage: lev, entryPx: String(entry), status: "open", paper: true, body: Math.random() < b.chatty ? pick(NOTES_OPEN) : null, createdAt: new Date(now - hours(rnd(0.2, 10))), slPx: String(side === "long" ? entry * 0.95 : entry * 1.05) }).returning({ id: schema.posts.id });
      created.push(p.id);
    }
    // calls
    if (Math.random() < b.calls + 0.3) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (mid) {
        const up = Math.random() < 0.6;
        const [p] = await db.insert(schema.posts).values({ userId: b.id, kind: "call", coin, side: up ? "long" : "short", targetPx: String(mid * (up ? 1.08 : 0.92)), invalidPx: String(mid * (up ? 0.96 : 1.04)), deadline: new Date(now + hours(rnd(24, 96))), callStatus: "open", status: "open", body: pick(["Funding negative while price holds the range. Shorts paying to be wrong.", "Weekly close above the level. Target is the prior high.", "Three taps on support, fourth one breaks.", "Open interest at ATH, this unwinds."]), meta: { fromPx: mid }, createdAt: new Date(now - hours(rnd(1, 20))) }).returning({ id: schema.posts.id });
        created.push(p.id);
      }
    }
  }
  // resolved calls for the calls board (so hit rates exist)
  for (const b of BOTS) {
    const n = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (!mid) continue;
      const hit = Math.random() < (b.calls > 0.4 ? 0.72 : 0.5);
      const up = Math.random() < 0.5;
      const target = mid * (up ? 1.05 : 0.95);
      const made = now - hours(rnd(48, 24 * 20));
      await db.insert(schema.posts).values({ userId: b.id, kind: "call", coin, side: up ? "long" : "short", targetPx: String(target), deadline: new Date(made + hours(48)), callStatus: hit ? "hit" : "missed", status: "closed", resolvedAt: new Date(made + hours(rnd(6, 48))), resolvedPx: String(hit ? target * (1 + rnd(0, 0.01)) : mid * (1 + rnd(-0.03, 0.03))), meta: { fromPx: mid * (up ? 0.99 : 1.01) }, createdAt: new Date(made) });
    }
  }
  // one poll
  const fm = BOTS[2];
  await db.insert(schema.posts).values({ userId: fm.id, kind: "poll", body: `SOL above ${Math.round(Number(mids["SOL"] ?? 180) * 1.05)} by Friday?`, options: ["Yes", "No"], closesAt: new Date(now + hours(72)), settle: { coin: "SOL", op: "gte", px: Math.round(Number(mids["SOL"] ?? 180) * 1.05) }, status: "open", coin: "SOL", paper: true });
  // comments + votes on recent posts
  const recent = await db.select({ id: schema.posts.id, userId: schema.posts.userId }).from(schema.posts).orderBy(desc(schema.posts.id)).limit(30);
  for (const p of recent) {
    for (const b of BOTS) {
      if (b.id === p.userId) continue;
      if (Math.random() < 0.5) await db.insert(schema.votes).values({ postId: p.id, userId: b.id, value: Math.random() < 0.8 ? 1 : -1 }).onConflictDoNothing();
      if (Math.random() < b.chatty * 0.35) await db.insert(schema.comments).values({ postId: p.id, userId: b.id, body: pick(COMMENTS) });
    }
  }
  return created.length;
}

/** One tick of bot life. Humans first: react to any human post from the last hour, then do own thing. */
export async function botTick() {
  const mids = await getMids();
  const maxMap = await maxLevMap();
  const now = Date.now();
  const log: string[] = [];
  const humanRecent = await db.select({ id: schema.posts.id, userId: schema.posts.userId, kind: schema.posts.kind, coin: schema.posts.coin, side: schema.posts.side, leverage: schema.posts.leverage, status: schema.posts.status })
    .from(schema.posts).innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(and(eq(schema.users.isBot, false), gte(schema.posts.createdAt, new Date(now - hours(1))), isNull(schema.posts.systemType)))
    .orderBy(desc(schema.posts.id)).limit(10);

  for (const b of BOTS) {
    const [me] = await db.select().from(schema.users).where(eq(schema.users.id, b.id)).limit(1);
    if (!me) continue;

    // 1. React to humans
    for (const hp of humanRecent) {
      if (Math.random() < 0.5) await db.insert(schema.votes).values({ postId: hp.id, userId: b.id, value: Math.random() < 0.85 ? 1 : -1 }).onConflictDoNothing();
      if (Math.random() < b.chatty * 0.3) await db.insert(schema.comments).values({ postId: hp.id, userId: b.id, body: pick(COMMENTS) });
      if (hp.kind === "trade" && hp.status === "open" && hp.coin && hp.side && Math.random() < 0.25) {
        const mid = Number(mids[hp.coin] ?? 0);
        const wantFade = b.fader ? Math.random() < 0.85 : Math.random() < 0.6;
        const fade = wantFade && !(await fadeBlockReason(b.id, hp.id));
        const [dupHuman] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, b.id), sql`(${schema.posts.copiedFromId} = ${hp.id} or ${schema.posts.fadedFromId} = ${hp.id})`)).limit(1);
        if (mid && !dupHuman && (fade || !wantFade)) {
          const side = fade ? (hp.side === "long" ? "short" : "long") : hp.side;
          const lev = b.style === "degen" || b.style === "high" ? pickLev(b, hp.coin!, maxMap) : Math.min(hp.leverage ?? 2, Math.max(2, maxMap[hp.coin!] ?? 20));
          const margin = pick([100, 250, 500]);
          await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin: hp.coin, side, size: String((margin * lev) / mid), notionalUsd: String(margin * lev), leverage: lev, entryPx: String(mid), status: "open", paper: true, copiedFromId: fade ? undefined : hp.id, fadedFromId: fade ? hp.id : undefined, body: fade ? pick(["Fading this. Sorry not sorry.", "Other side of this one.", "Respectfully, no."]) : pick(["Copied. Let's ride.", "In with you.", "Copied at market."]) });
          if (hp.userId) await notify(hp.userId, fade ? "faded" : "copied", `${b.handle} ${fade ? "faded" : "copied"} your ${hp.coin} trade`, `$${margin * lev} at ${mid}`, `/post/${hp.id}`);
          log.push(`${b.handle} ${fade ? "faded" : "copied"} ${hp.coin}`);
        }
      }
    }

    // 2. Manage own open trades: close on stop/target-ish or after hold time
    const open = await db.select().from(schema.posts).where(and(eq(schema.posts.userId, b.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open")));
    for (const t of open) {
      const mid = Number(mids[t.coin!] ?? 0);
      if (!mid) continue;
      const entry = Number(t.entryPx), roi = ((mid - entry) / entry) * (t.side === "long" ? 1 : -1) * (t.leverage ?? 1) * 100;
      const age = now - new Date(t.createdAt).getTime();
      const stopHit = t.slPx && (t.side === "long" ? mid <= Number(t.slPx) : mid >= Number(t.slPx));
      const shouldClose = stopHit || roi > rnd(4, 15) || roi < -rnd(6, 20) || age > hours(rnd(b.holdH[0], b.holdH[1]) * 0.6);
      if (!shouldClose) continue;
      const pnl = (t.side === "long" ? mid - entry : entry - mid) * Number(t.size);
      const liq = roi <= -90;
      await db.update(schema.posts).set({ status: "closed", exitPx: String(mid), realizedPnl: pnl.toFixed(4), closedAt: new Date(), meta: { ...(t.meta ?? {}), closeReason: liq ? "liquidation" : stopHit ? "sl" : "manual" } }).where(eq(schema.posts.id, t.id));
      const margin = Number(t.notionalUsd) / (t.leverage ?? 1);
      await db.update(schema.users).set({ demoBalance: Math.max(0, Number(me.demoBalance) + margin + pnl).toFixed(2) }).where(eq(schema.users.id, b.id));
      if (Math.random() < b.chatty) await db.insert(schema.comments).values({ postId: t.id, userId: b.id, body: pnl >= 0 ? pick(NOTES_CLOSE_WIN) : pick(NOTES_CLOSE_LOSS) });
      if (liq) await systemPost("liquidation", `${b.handle} got perped. −$${Math.abs(pnl).toFixed(0)} on ${t.coin} ${t.leverage}× ${t.side}, liquidated at ${mid}.`, { handle: b.handle, pnl, coin: t.coin, postId: t.id }, t.coin ?? undefined);
      if (roi >= 100) await systemPost("milestone", `${b.handle} just hit ${(roi / 100 + 1).toFixed(1)}× on ${t.coin} ${t.side} and banked it.`, { handle: b.handle, roi, coin: t.coin, postId: t.id }, t.coin ?? undefined);
      log.push(`${b.handle} closed ${t.coin} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}`);
    }

    // 3. Maybe open something new (keep 1–3 open)
    const openCount = open.length;
    // Bots never run dry: top up the practice balance so volume keeps flowing.
    if (Number(me.demoBalance) < 5000) { await db.update(schema.users).set({ demoBalance: "50000" }).where(eq(schema.users.id, b.id)); me.demoBalance = "50000"; }
    // More of their own trades: up to 2 new positions a run, up to 8 open at once.
    const tries = openCount === 0 ? 2 : openCount < 4 ? (Math.random() < 0.5 ? 2 : 1) : 1;
    for (let k = 0; k < tries; k++) if (openCount + k < 8 && Math.random() < (openCount === 0 ? 0.95 : 0.75)) {
      const coin = Math.random() < 0.75 ? pick(b.coins) : pick(["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "WIF"]), mid = Number(mids[coin] ?? 0);
      if (mid && Number(me.demoBalance) > 30) {
        const side = Math.random() < b.bias ? "long" : "short";
        const lev = pickLev(b, coin, maxMap);
        const margin = Math.min(pick([100, 250, 250, 500, 750, 1000, 2000]), Number(me.demoBalance) * 0.3);
        await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin, side, size: String((margin * lev) / mid), notionalUsd: String(margin * lev), leverage: lev, entryPx: String(mid), status: "open", paper: true, body: Math.random() < b.chatty ? pick(NOTES_OPEN) : null, slPx: String(side === "long" ? mid * (1 - 0.06 / lev) : mid * (1 + 0.06 / lev)) });
        me.demoBalance = (Number(me.demoBalance) - margin).toFixed(2);
        await db.update(schema.users).set({ demoBalance: me.demoBalance }).where(eq(schema.users.id, b.id));
        const [justOpened] = await db.select({ id: schema.posts.id, coin: schema.posts.coin, side: schema.posts.side, leverage: schema.posts.leverage }).from(schema.posts).where(eq(schema.posts.userId, b.id)).orderBy(desc(schema.posts.id)).limit(1);
        if (justOpened) await alertRivals(b.id, justOpened).catch(() => 0);
        log.push(`${b.handle} opened ${side} ${coin}`);
      }
    }

    // 4. Occasionally make a call
    if (Math.random() < b.calls * 0.2) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (mid) {
        const up = Math.random() < 0.55;
        await db.insert(schema.posts).values({ userId: b.id, kind: "call", coin, side: up ? "long" : "short", targetPx: String(mid * (up ? 1 + rnd(0.03, 0.1) : 1 - rnd(0.03, 0.1))), invalidPx: String(mid * (up ? 0.96 : 1.04)), deadline: new Date(now + hours(pick([24, 72, 168]))), callStatus: "open", status: "open", body: pick(["Range is compressing, this resolves up.", "Lower highs all week. Target is the range low.", "Funding too hot. Reset incoming.", "Breakout retest holding. Continuation."]), meta: { fromPx: mid } });
        log.push(`${b.handle} called ${coin}`);
      }
    }

    // 4b. Reply in threads on own posts when others commented (keeps call-outs alive)
    const myRecent = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, b.id), gte(schema.posts.createdAt, new Date(now - hours(24))))).limit(10);
    for (const mp of myRecent) {
      const [latest] = await db.select().from(schema.comments).where(and(eq(schema.comments.postId, mp.id), ne(schema.comments.userId, b.id))).orderBy(desc(schema.comments.id)).limit(1);
      if (!latest) continue;
      const [already] = await db.select({ id: schema.comments.id }).from(schema.comments).where(and(eq(schema.comments.postId, mp.id), eq(schema.comments.userId, b.id), eq(schema.comments.parentId, latest.id))).limit(1);
      if (!already && Math.random() < b.chatty * 0.6) await db.insert(schema.comments).values({ postId: mp.id, userId: b.id, parentId: latest.id, body: pick(REPLIES_OWN) });
    }

    // 4c. Copy or fade another bot's live trade (contrarians fade the crowd, similar bots copy each other)
    const botLive = await db.select({ id: schema.posts.id, userId: schema.posts.userId, coin: schema.posts.coin, side: schema.posts.side, leverage: schema.posts.leverage })
      .from(schema.posts).innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
      .where(and(eq(schema.users.isBot, true), ne(schema.posts.userId, b.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), gte(schema.posts.createdAt, new Date(now - hours(3)))))
      .orderBy(sql`random()`).limit(2);
    for (const t of botLive) {
      const other = BOTS.find((x) => x.id === t.userId);
      if (!other || !t.coin || !t.side) continue;
      const mid = Number(mids[t.coin] ?? 0);
      if (!mid || Number(me.demoBalance) < 60) continue;
      const alike = similarity(b, other);
      // Mostly trades and fades: fades are common, copies rare.
      const fade = b.fader ? Math.random() < 0.7 : Math.random() < 0.35;
      const copy = !fade && Math.random() < alike * 0.05;
      if (!fade && !copy) continue;
      const [dup] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, b.id), sql`(${schema.posts.copiedFromId} = ${t.id} or ${schema.posts.fadedFromId} = ${t.id})`)).limit(1);
      if (dup) continue;
      if (fade && (await fadeBlockReason(b.id, t.id))) continue;
      const side = fade ? (t.side === "long" ? "short" : "long") : t.side;
      const lev = b.style === "degen" || b.style === "high" ? pickLev(b, t.coin!, maxMap) : Math.min(t.leverage ?? 2, Math.max(2, maxMap[t.coin!] ?? 20));
      const margin = pick([25, 50, 75]);
      await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin: t.coin, side, size: String((margin * lev) / mid), notionalUsd: String(margin * lev), leverage: lev, entryPx: String(mid), status: "open", paper: true, copiedFromId: copy ? t.id : undefined, fadedFromId: fade ? t.id : undefined, body: fade ? pick(["Fading this. Sorry not sorry.", "Other side of this one.", "Respectfully, no."]) : pick(["Copied. Let's ride.", "In with you.", "Copied at market."]), slPx: String(side === "long" ? mid * (1 - 0.06 / lev) : mid * (1 + 0.06 / lev)) });
      await db.update(schema.users).set({ demoBalance: (Number(me.demoBalance) - margin).toFixed(2) }).where(eq(schema.users.id, b.id));
      await notify(t.userId!, fade ? "faded" : "copied", `${b.handle} ${fade ? "faded" : "copied"} your ${t.coin} trade`, `$${margin * lev} at ${mid}`, `/post/${t.id}`);
      if (Math.random() < 0.5) await db.insert(schema.comments).values({ postId: t.id, userId: b.id, body: fade ? pick(["fading this 🫡", "see you on the other side", "nope"]) : pick(["copied at your entry", "in", "same read"]) });
      log.push(`${b.handle} ${fade ? "faded" : "copied"} ${other.handle} ${t.coin}`);
    }

    // 4d. Duels: challenge someone who faded you recently (or a rival); accept pending challenges
    const pending = await db.select().from(schema.duels).where(and(eq(schema.duels.opponentId, b.id), eq(schema.duels.status, "pending"))).limit(2);
    for (const d of pending) {
      const mid = Number(mids[d.coin] ?? 0);
      if (!mid) continue;
      const accept = Math.random() < 0.8;
      if (!accept) { await db.update(schema.duels).set({ status: "declined" }).where(eq(schema.duels.id, d.id)); log.push(`${b.handle} declined duel`); continue; }
      const side = d.challengerSide === "long" ? "short" : "long";
      const stake = Number(d.stakeUsd);
      const [post] = await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin: d.coin, side, size: String((stake * 2) / mid), notionalUsd: String(stake * 2), leverage: 2, entryPx: String(mid), status: "open", paper: true, body: `Duel accepted. ${pick(DUEL_LINES)}`, meta: { duelId: d.id } }).returning({ id: schema.posts.id });
      await db.update(schema.duels).set({ status: "live", opponentPostId: post.id, startPx: String(mid) }).where(eq(schema.duels.id, d.id));
      await notify(d.challengerId, "duel", `${b.handle} accepted your duel`, `${d.coin} · $${stake}`, `/duels/${d.id}`);
      log.push(`${b.handle} accepted duel ${d.coin}`);
    }
    const myLiveDuels = await db.select({ id: schema.duels.id }).from(schema.duels).where(and(sql`(${schema.duels.challengerId} = ${b.id} or ${schema.duels.opponentId} = ${b.id})`, sql`${schema.duels.status} in ('pending','live')`));
    if (myLiveDuels.length === 0 && Math.random() < 0.12) {
      // prefer whoever faded me most recently
      const [fader] = await db.select({ userId: schema.posts.userId }).from(schema.posts).innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
        .where(and(eq(schema.users.isBot, true), sql`${schema.posts.fadedFromId} in (select id from posts where user_id = ${b.id})`)).orderBy(desc(schema.posts.id)).limit(1);
      const target = BOTS.find((x) => x.id === fader?.userId) ?? pick(BOTS.filter((x) => x.id !== b.id));
      const coin = pick(b.coins.filter((c) => target.coins.includes(c)).length ? b.coins.filter((c) => target.coins.includes(c)) : b.coins);
      const mid = Number(mids[coin] ?? 0);
      if (mid && Number(me.demoBalance) > 120) {
        const side = Math.random() < b.bias ? "long" : "short";
        const stake = pick([50, 100]);
        const [post] = await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin, side, size: String((stake * 2) / mid), notionalUsd: String(stake * 2), leverage: 2, entryPx: String(mid), status: "open", paper: true, body: `⚔ Challenging ${target.handle}. ${pick(DUEL_LINES)}` }).returning({ id: schema.posts.id });
        const [duel] = await db.insert(schema.duels).values({ challengerId: b.id, opponentId: target.id, coin, challengerSide: side, stakeUsd: String(stake), settlesAt: new Date(now + hours(48)), challengerPostId: post.id, startPx: String(mid) }).returning({ id: schema.duels.id });
        await db.update(schema.posts).set({ meta: { duelId: duel.id } }).where(eq(schema.posts.id, post.id));
        await db.update(schema.users).set({ demoBalance: (Number(me.demoBalance) - stake).toFixed(2) }).where(eq(schema.users.id, b.id));
        await notify(target.id, "duel", `${b.handle} challenged you to a duel`, `${coin} · $${stake} · 48h`, `/duels/${duel.id}`);
        log.push(`${b.handle} challenged ${target.handle} on ${coin}`);
      }
    }

    // 4e. Vote in open polls; occasionally start one
    const openPolls = await db.select({ id: schema.posts.id, options: schema.posts.options }).from(schema.posts).where(and(eq(schema.posts.kind, "poll"), eq(schema.posts.status, "open"), ne(schema.posts.userId, b.id))).limit(3);
    for (const pl of openPolls) if (Math.random() < 0.5) await db.insert(schema.pollVotes).values({ postId: pl.id, userId: b.id, option: Math.floor(Math.random() * (pl.options?.length ?? 2)) }).onConflictDoNothing();
    if (Math.random() < 0.04) {
      const [q, opts, coin, op] = pick([...POLLS]);
      const mid = Number(mids[coin] ?? 0);
      if (mid) {
        const px = Math.round(mid * (op === "gte" ? 1.04 : 0.96) * 100) / 100;
        await db.insert(schema.posts).values({ userId: b.id, kind: "poll", body: q.replace("{px}", String(px)), options: [...opts], closesAt: new Date(now + hours(72)), settle: { coin, op, px }, status: "open", coin, paper: true });
        log.push(`${b.handle} started a poll`);
      }
    }

    // 4f. Follow bots who've been doing well lately; occasionally pin a best trade
    if (Math.random() < 0.1) {
      const [best] = await db.select({ userId: schema.stats.userId }).from(schema.stats).innerJoin(schema.users, eq(schema.users.id, schema.stats.userId)).where(and(eq(schema.users.isBot, true), ne(schema.users.id, b.id))).orderBy(desc(schema.stats.realizedPnl7d)).limit(1);
      if (best) await db.insert(schema.follows).values({ followerId: b.id, followeeId: best.userId }).onConflictDoNothing();
    }
    if (Math.random() < 0.05) {
      const [top] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, b.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed"))).orderBy(desc(sql`${schema.posts.realizedPnl}::numeric`)).limit(1);
      if (top) await db.update(schema.posts).set({ pinned: true }).where(eq(schema.posts.id, top.id));
    }

    // 5. Vote/comment on other bots' recent posts (keeps the feed social)
    const others = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(ne(schema.posts.userId, b.id), gte(schema.posts.createdAt, new Date(now - hours(6))))).orderBy(sql`random()`).limit(3);
    for (const o of others) {
      if (Math.random() < 0.5) await db.insert(schema.votes).values({ postId: o.id, userId: b.id, value: Math.random() < 0.8 ? 1 : -1 }).onConflictDoNothing();
      if (Math.random() < b.chatty * 0.15) await db.insert(schema.comments).values({ postId: o.id, userId: b.id, body: pick(COMMENTS) });
    }
  }
  return log;
}

export async function purgeBots() {
  const ids = BOTS.map((b) => b.id);
  for (const id of ids) {
    await db.delete(schema.comments).where(eq(schema.comments.userId, id));
    await db.delete(schema.votes).where(eq(schema.votes.userId, id));
    await db.delete(schema.pollVotes).where(eq(schema.pollVotes.userId, id));
    await db.delete(schema.posts).where(eq(schema.posts.userId, id));
    await db.delete(schema.follows).where(eq(schema.follows.followerId, id));
    await db.delete(schema.follows).where(eq(schema.follows.followeeId, id));
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
    await db.delete(schema.stats).where(eq(schema.stats.userId, id));
    await db.delete(schema.users).where(eq(schema.users.id, id));
  }
  // system posts that referenced bots
  await db.delete(schema.posts).where(and(eq(schema.posts.kind, "system"), sql`${schema.posts.meta}->>'handle' in (${sql.join(BOTS.map((b) => sql`${b.handle}`), sql`, `)})`));
  return ids.length;
}

/**
 * Placeholder ranks: give every account with no XP history a random XP total and battle record, so the
 * ladder, emblems and the Ranks board look lived-in before real battles have settled. Skips anyone who has
 * earned XP for real (an xp_log row exists). Safe to call every tick.
 */
export async function seedRanks() {
  const rows = await db.select({ id: schema.users.id, xp: schema.users.xp, isBot: schema.users.isBot })
    .from(schema.users)
    .where(sql`${schema.users.xp} = 0 and not exists (select 1 from xp_log x where x.user_id = ${schema.users.id})`);
  let n = 0;
  for (const u of rows) {
    // Skewed: most people low-mid, a few high. Bots get the full spread so the top of the ladder isn't empty.
    const r = Math.random();
    const xp = Math.round(u.isBot
      ? (r < 0.4 ? rnd(150, 1200) : r < 0.8 ? rnd(1200, 5000) : rnd(5000, 23000))
      : (r < 0.6 ? rnd(50, 500) : r < 0.9 ? rnd(500, 2500) : rnd(2500, 7000)));
    const won = Math.round(rnd(0, Math.max(1, xp / 150))), lost = Math.round(rnd(0, Math.max(1, xp / 220)));
    await db.update(schema.users).set({ xp }).where(eq(schema.users.id, u.id));
    await db.insert(schema.stats).values({ userId: u.id, battlesWon: won, battlesLost: lost }).onConflictDoUpdate({ target: schema.stats.userId, set: { battlesWon: won, battlesLost: lost } });
    await db.insert(schema.xpLog).values({ userId: u.id, delta: xp, reason: "season_start", ref: "seed" });
    n++;
  }
  return n;
}


/**
 * Volume boost: top every bot up to ~40 closed trades over the last 30 days with bigger tickets, so the
 * P&L, volume and win-rate boards have something to rank. Idempotent: only tops up bots below the target.
 */
export async function boostHistory(target = 40) {
  const mids = await getMids();
  const maxMap = await maxLevMap();
  const now = Date.now();
  let added = 0;
  for (const b of BOTS) {
    const [c] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.posts).where(and(eq(schema.posts.userId, b.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed")));
    const need = target - (c?.n ?? 0);
    for (let i = 0; i < need; i++) {
      const coin = pick(b.coins), mid = Number(mids[coin] ?? 0);
      if (!mid) continue;
      const side = Math.random() < b.bias ? "long" : "short";
      const lev = pickLev(b, coin, maxMap);
      const openedAt = now - hours(rnd(2, 24 * 30));
      const hold = hours(rnd(b.holdH[0], b.holdH[1]));
      const win = Math.random() < b.winSkew;
      const move = (rnd(0.3, 5) / 100) * (win ? 1 : -1) * (side === "long" ? 1 : -1);
      const entry = mid * (1 + rnd(-0.08, 0.08));
      const exit = entry * (1 + move);
      const margin = pick([250, 500, 500, 1000, 1500, 2000, 3000, 5000]);
      const notional = margin * lev, size = notional / entry;
      const liq = !win && Math.random() < 0.08;
      const pnl = liq ? -margin : (side === "long" ? exit - entry : entry - exit) * size;
      await db.insert(schema.posts).values({ userId: b.id, kind: "trade", coin, side, size: String(size), notionalUsd: String(notional), leverage: lev, entryPx: String(entry), status: "closed", exitPx: String(liq ? (side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev)) : exit), realizedPnl: pnl.toFixed(4), closedAt: new Date(Math.min(now - 60_000, openedAt + hold)), paper: true, body: Math.random() < b.chatty * 0.5 ? pick(NOTES_OPEN) : null, createdAt: new Date(openedAt), meta: { closeReason: liq ? "liquidation" : "manual" } });
      added++;
    }
  }
  return added;
}

/** Keep bot profile pictures in sync with the art registry (runs every tick; cheap). */
export async function syncBotAvatars() {
  for (const b of BOTS) await db.update(schema.users).set({ avatarUrl: `/api/share-bg/bot-${b.handle}` }).where(and(eq(schema.users.id, b.id), sql`coalesce(avatar_url, '') <> ${`/api/share-bg/bot-${b.handle}`}`));
}

/**
 * Bots curate their own trophy shelf: up to 4 pins, chosen from their closed trades as
 *  1. the trades that beat the most faders (ties → widest winning margin),
 *  2. their most recent battle win (the one keeping a streak alive),
 *  3. their best ROI.
 * Only rewrites pins when the choice changed. Runs each bot tick.
 */
export async function botPins() {
  let changed = 0;
  for (const b of BOTS) {
    const rows = await db.select({ id: schema.posts.id, pinned: schema.posts.pinned, meta: schema.posts.meta, entryPx: schema.posts.entryPx, exitPx: schema.posts.exitPx, side: schema.posts.side, leverage: schema.posts.leverage, closedAt: schema.posts.closedAt })
      .from(schema.posts)
      .where(and(eq(schema.posts.userId, b.id), eq(schema.posts.kind, "trade"), eq(schema.posts.status, "closed")))
      .orderBy(desc(schema.posts.closedAt)).limit(200);
    if (!rows.length) continue;
    type Bt = { won: boolean | null; myRoi: number; theirRoi: number; battleId: number };
    const info = rows.map((r) => {
      const battles = (((r.meta ?? {}) as { battles?: Bt[] }).battles ?? []);
      const wins = battles.filter((x) => x.won === true);
      const entry = Number(r.entryPx), exit = Number(r.exitPx ?? entry);
      const roi = ((exit - entry) / entry) * 100 * (r.side === "long" ? 1 : -1) * (r.leverage ?? 1);
      return { id: r.id, pinned: r.pinned, wins: wins.length, margin: Math.max(0, ...wins.map((w) => w.myRoi - w.theirRoi)), roi, latestWin: wins.length ? Math.max(...wins.map((w) => w.battleId)) : 0 };
    });
    const pick = new Set<number>();
    for (const r of [...info].filter((r) => r.wins > 0).sort((a, z) => z.wins - a.wins || z.margin - a.margin).slice(0, 2)) pick.add(r.id);
    const recent = [...info].filter((r) => r.wins > 0).sort((a, z) => z.latestWin - a.latestWin)[0];
    if (recent) pick.add(recent.id);
    for (const r of [...info].filter((r) => r.roi > 0).sort((a, z) => z.roi - a.roi)) { if (pick.size >= 4) break; pick.add(r.id); }
    const current = new Set(info.filter((r) => r.pinned).map((r) => r.id));
    if (current.size === pick.size && [...pick].every((id) => current.has(id))) continue;
    await db.update(schema.posts).set({ pinned: false }).where(and(eq(schema.posts.userId, b.id), eq(schema.posts.pinned, true)));
    if (pick.size) await db.update(schema.posts).set({ pinned: true }).where(inArray(schema.posts.id, [...pick]));
    changed++;
  }
  return changed;
}

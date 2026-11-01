import { z } from "zod";
import { ensureBattle } from "@/lib/battles";
import { fadeBlockReason } from "@/lib/fades";
import { alertRivals } from "@/lib/rivalries";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { queryFeed, notify } from "@/lib/feed";
import { DEMO_ENABLED } from "@/lib/config";
import { getLiveSettings, liveAllowed } from "@/lib/live";
import { getFrontendOpenOrders, getMids, getPerpAssets } from "@/lib/hl-info";
import { fillsForOrder, vwap } from "@/lib/hlfills";
import { normCoin } from "@/lib/format";

/**
 * Keep the For-you feed mixed: system cards (battle / duel results, milestones, settlements, market stories)
 * are capped to one in every three items and never two of the same type in a row, so a burst of settlements
 * can't bury people's trades, calls and posts. Order stays chronological within what survives.
 */
function diversify<T extends { post: { kind: string; systemType?: string | null } }>(rows: T[], limit: number): T[] {
  const out: T[] = [];
  let sinceSystem = 3, lastSys = "";
  for (const r of rows) {
    const sys = r.post.kind === "system";
    if (sys) {
      const t = r.post.systemType ?? "";
      if (sinceSystem < 2 || t === lastSys) continue;
      sinceSystem = 0; lastSys = t;
    } else sinceSystem++;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * GET /api/posts?tab=foryou|following|live&kind=&coin=&handle=&status=&cursor=&limit=
 * Feed filters (Home filter sheet): coins=BTC,ETH · side=long|short · minMargin/maxMargin (USD) · minLev/maxLev ·
 * kinds=trade,call,poll,text,system · money=real|demo · verified=1 · nobots=1 · hot=1 (3+ copies or fades)
 * Feed, newest first (pinned first on a profile), with author, votes, copies, fades, poll counts.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
  const limit = Math.min(50, Math.max(1, Math.floor(Number(q.limit) || 30)));
  // Cursor is the createdAt (ms) of the last row seen, so paging follows the chronological order.
  const cursor = Number(q.cursor ?? 0);
  const auth = await getAuth(req).catch(() => null);

  const conds = [
    q.handle ? eq(schema.users.handle, q.handle.toLowerCase()) : undefined,
    q.coin ? eq(schema.posts.coin, normCoin(q.coin)) : undefined,
    q.kind ? eq(schema.posts.kind, q.kind as "trade") : undefined,
    q.status === "open" || q.status === "closed" ? eq(schema.posts.status, q.status) : undefined,
    cursor ? sql`${schema.posts.createdAt} < ${new Date(cursor).toISOString()}::timestamptz` : undefined,
  ];
  // Home filters. Trade-only filters (side, margin, leverage) let non-trade posts through only when the
  // person hasn't restricted kinds to trades, so a coin filter still shows that coin's calls and polls.
  const coins = (q.coins ?? "").split(",").map((c) => normCoin(c)).filter(Boolean);
  if (coins.length) conds.push(inArray(schema.posts.coin, coins));
  const kinds = (q.kinds ?? "").split(",").map((k) => k.trim()).filter((k) => ["trade", "call", "poll", "text", "system"].includes(k)) as ("trade" | "call" | "poll" | "text" | "system")[];
  if (kinds.length) conds.push(inArray(schema.posts.kind, kinds));
  const tradeOnly = (c: ReturnType<typeof sql>) => sql`(${schema.posts.kind} <> 'trade' or ${c})`;
  if (q.side === "long" || q.side === "short") conds.push(tradeOnly(sql`${schema.posts.side} = ${q.side}`));
  const margin = sql`(${schema.posts.notionalUsd}::numeric / greatest(1, coalesce(${schema.posts.leverage}, 1)))`;
  if (Number(q.minMargin) > 0) conds.push(tradeOnly(sql`${margin} >= ${Number(q.minMargin)}`));
  if (Number(q.maxMargin) > 0) conds.push(tradeOnly(sql`${margin} <= ${Number(q.maxMargin)}`));
  if (Number(q.minLev) > 0) conds.push(tradeOnly(sql`coalesce(${schema.posts.leverage}, 1) >= ${Number(q.minLev)}`));
  if (Number(q.maxLev) > 0) conds.push(tradeOnly(sql`coalesce(${schema.posts.leverage}, 1) <= ${Number(q.maxLev)}`));
  if (q.money === "real") conds.push(sql`(${schema.posts.kind} <> 'trade' or (${schema.posts.paper} = false and ${schema.users.isDemo} = false))`);
  if (q.money === "demo") conds.push(sql`(${schema.posts.kind} <> 'trade' or ${schema.posts.paper} = true or ${schema.users.isDemo} = true)`);
  if (q.verified === "1") conds.push(sql`(${schema.posts.kind} = 'system' or ${schema.users.verified} = true)`);
  if (q.nobots === "1") conds.push(sql`(${schema.posts.kind} = 'system' or coalesce(${schema.users.isBot}, false) = false)`);
  if (q.hot === "1") conds.push(sql`(${schema.posts.kind} <> 'trade' or (select count(*) from posts x where x.copied_from_id = ${schema.posts.id} or x.faded_from_id = ${schema.posts.id}) >= 3)`);
  if (q.tab === "live") conds.push(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open")));
  // For you: closed trades live in the "Banked" banner, not the feed.
  if (q.tab === "foryou" || (!q.tab && !q.handle && !q.coin && !q.status)) conds.push(sql`not (${schema.posts.kind} = 'trade' and ${schema.posts.status} = 'closed')`);
  if (q.tab === "following") {
    if (!auth) return Response.json({ posts: [], nextCursor: null });
    const f = await db.select({ id: schema.follows.followeeId }).from(schema.follows).where(eq(schema.follows.followerId, auth.privyId));
    const ids = [...f.map((x) => x.id), auth.privyId];
    conds.push(inArray(schema.posts.userId, ids));
  }
  try {
    const forYou = q.tab === "foryou" || (!q.tab && !q.handle && !q.coin && !q.status);
    let posts = await queryFeed({ where: and(...conds.filter(Boolean)), limit: forYou ? limit * 2 : limit, viewerId: auth?.privyId, pinnedFirst: !!q.handle });
    if (forYou) posts = diversify(posts, limit);
    // Real people first: on the top page, live posts by humans from the last 3 hours float above the bots.
    if (forYou && !q.cursor) {
      const fresh = (r: (typeof posts)[number]) => !!r.author && !r.author.isBot && Date.now() - new Date(r.post.createdAt).getTime() < 3 * 3_600_000;
      posts = [...posts.filter(fresh), ...posts.filter((r) => !fresh(r))];
    }
    const oldest = posts.reduce((m, r) => Math.min(m, new Date(r.post.createdAt).getTime()), Infinity);
    return Response.json({ posts, nextCursor: posts.length >= limit && Number.isFinite(oldest) ? oldest : null });
  } catch (e) {
    console.error("[posts] feed query failed", e);
    return Response.json({ posts: [], nextCursor: null, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

const Trade = z.object({
  kind: z.literal("trade"),
  coin: z.string().min(1).max(20),
  side: z.enum(["long", "short"]),
  size: z.number().positive(),
  notionalUsd: z.number().positive(),
  leverage: z.number().int().min(1).max(200), // Hyperliquid's own per-market max is checked in POST
  entryPx: z.number().positive(),
  paper: z.boolean().optional(),
  oid: z.number().int().optional(),
  body: z.string().max(280).optional(),
  copiedFromId: z.number().int().optional(),
  fadedFromId: z.number().int().optional(),
  tpPx: z.number().positive().optional(),
  slPx: z.number().positive().optional(),
  backsCallId: z.number().int().optional(),
});
const Text = z.object({ kind: z.literal("text"), body: z.string().trim().min(1).max(1000), coin: z.string().max(20).optional() });
const Call = z.object({
  kind: z.literal("call"),
  coin: z.string().min(1).max(20),
  side: z.enum(["long", "short"]),
  targetPx: z.number().positive(),
  invalidPx: z.number().positive().optional(),
  deadline: z.string().datetime(),
  body: z.string().max(500).optional(),
  backedPostId: z.number().int().optional(),
});
const Poll = z.object({
  kind: z.literal("poll"),
  body: z.string().trim().min(3).max(200),
  options: z.array(z.string().trim().min(1).max(40)).min(2).max(4),
  closesAt: z.string().datetime(),
  settle: z.object({ coin: z.string(), op: z.enum(["gte", "lte"]), px: z.number().positive() }).nullable().optional(),
});
const Body = z.discriminatedUnion("kind", [Trade, Text, Call, Poll]);

/** POST /api/posts → create a post of any kind. Trades are recorded after the client fills on Hyperliquid. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  if (!profile) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;
  if (b.kind === "poll" && !profile.verified) return Response.json({ error: "polls are for verified traders (10+ closed trades and a linked X account)" }, { status: 403 });

  if (b.kind === "trade") {
    if (b.fadedFromId) {
      const why = await fadeBlockReason(profile.id, b.fadedFromId, { coin: b.coin, side: b.side });
      if (why) return Response.json({ error: why }, { status: 409 });
    }
    // Leverage cap = Hyperliquid's own max for this market.
    const assets = await getPerpAssets().catch(() => []);
    const cap = assets.find((a) => a.name === normCoin(b.coin))?.maxLeverage ?? 50;
    if (b.leverage > cap) return Response.json({ error: `Hyperliquid allows up to ${cap}× on ${normCoin(b.coin)}` }, { status: 400 });
  }

  if (b.kind === "trade" && (b.fadedFromId || b.copiedFromId)) {
    const srcId = (b.fadedFromId ?? b.copiedFromId)!;
    const [src] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, srcId)).limit(1);
    if (src?.userId) {
      const [owner] = await db.select({ allowFade: schema.users.allowFade, allowCopy: schema.users.allowCopy }).from(schema.users).where(eq(schema.users.id, src.userId)).limit(1);
      if (owner && b.fadedFromId && !owner.allowFade) return Response.json({ error: "this trader has turned fading off" }, { status: 403 });
      if (owner && b.copiedFromId && !owner.allowCopy) return Response.json({ error: "this trader has turned copying off" }, { status: 403 });
    }
  }
  const values: typeof schema.posts.$inferInsert = { userId: profile.id, kind: b.kind, body: "body" in b ? b.body : undefined };
  if (b.kind === "trade" && !(b.paper || profile.isDemo) && !liveAllowed((await getLiveSettings()).open, profile)) {
    return Response.json({ error: "live_closed", message: "Real-money trading opens soon. Trades are demo only for now." }, { status: 403 });
  }
  if (b.kind === "trade" && (b.paper || profile.isDemo)) {
    if (!DEMO_ENABLED && !profile.isBot) return Response.json({ error: "demo mode is off; switch to live trading in Settings" }, { status: 403 });
    // Demo: fill at the live mid on the server, deduct margin from the virtual balance.
    const mids = await getMids().catch(() => ({} as Record<string, string>));
    const mid = Number(mids[normCoin(b.coin)] ?? 0);
    if (!mid) return Response.json({ error: "no price for that market" }, { status: 400 });
    const margin = b.notionalUsd / b.leverage;
    if (margin > Number(profile.demoBalance)) return Response.json({ error: `demo balance is $${Number(profile.demoBalance).toFixed(2)}` }, { status: 400 });
    b.entryPx = mid;
    b.size = b.notionalUsd / mid;
    values.paper = true;
    // Deduct atomically: fails if a parallel request already spent the balance.
    const [paid] = await db.update(schema.users).set({ demoBalance: sql`${schema.users.demoBalance} - ${margin.toFixed(2)}` })
      .where(and(eq(schema.users.id, profile.id), sql`${schema.users.demoBalance} >= ${margin.toFixed(2)}`)).returning({ id: schema.users.id });
    if (!paid) return Response.json({ error: "not enough demo balance" }, { status: 400 });
  }
  if (b.kind === "trade" && !values.paper) {
    // Real money: entry and size come from the actual fills on Hyperliquid, looked up by order id.
    if (!auth.address) return Response.json({ error: "connect your wallet to post a live trade" }, { status: 400 });
    if (!b.oid) return Response.json({ error: "missing Hyperliquid order id" }, { status: 400 });
    let fills = await fillsForOrder(auth.address, b.oid, normCoin(b.coin)).catch(() => null);
    if (fills && !fills.length) { await new Promise((r) => setTimeout(r, 1500)); fills = await fillsForOrder(auth.address, b.oid, normCoin(b.coin)).catch(() => null); } // fills can lag the order by a moment
    if (fills && fills.length) {
      const v = vwap(fills)!;
      const bought = fills[0].side === "B";
      if ((b.side === "long") !== bought) return Response.json({ error: "that order was on the other side" }, { status: 400 });
      b.entryPx = v.px; b.size = v.sz; b.notionalUsd = v.px * v.sz;
    } else if (fills) {
      const resting = await getFrontendOpenOrders(auth.address).then((o) => o.some((x) => x.oid === b.oid)).catch(() => false);
      if (!resting) return Response.json({ error: "we couldn't find that order on Hyperliquid" }, { status: 400 });
      values.meta = { ...(values.meta ?? {}), pendingFill: true };
    } else {
      // Hyperliquid didn't answer, so the trade can't be verified: don't post unverified numbers. The order itself is on Hyperliquid.
      return Response.json({ error: "Your order went through on Hyperliquid, but we couldn't confirm the fill yet. It will show on your profile in a moment; post it again if you want it in the feed." }, { status: 503 });
    }
  }
  if (b.kind === "trade") {
    Object.assign(values, {
      coin: normCoin(b.coin), side: b.side, size: String(b.size), notionalUsd: String(b.notionalUsd), leverage: b.leverage, entryPx: String(b.entryPx),
      oid: b.oid, copiedFromId: b.copiedFromId, fadedFromId: b.fadedFromId, tpPx: b.tpPx ? String(b.tpPx) : undefined, slPx: b.slPx ? String(b.slPx) : undefined,
    });
  } else if (b.kind === "call") {
    Object.assign(values, { coin: normCoin(b.coin), side: b.side, targetPx: String(b.targetPx), invalidPx: b.invalidPx ? String(b.invalidPx) : undefined, deadline: new Date(b.deadline), callStatus: "open", backedPostId: b.backedPostId, status: "open" });
  } else if (b.kind === "poll") {
    Object.assign(values, { options: b.options, closesAt: new Date(b.closesAt), settle: b.settle ?? null, coin: b.settle?.coin, status: "open" });
  } else {
    Object.assign(values, { coin: b.coin ? normCoin(b.coin) : undefined, status: "closed" });
  }
  if (b.kind === "call") {
    // Remember the price when the call was made, for the progress bar and the "+12% from here" line.
    const fromPx = await getMids().then((m) => Number(m[normCoin(b.coin)] ?? 0)).catch(() => 0);
    if (!fromPx) return Response.json({ error: "no live price for that market" }, { status: 400 });
    if (b.side === "long" ? b.targetPx <= fromPx : b.targetPx >= fromPx) return Response.json({ error: `target has to be ${b.side === "long" ? "above" : "below"} the current price (${fromPx})` }, { status: 400 });
    if (b.invalidPx && (b.side === "long" ? b.invalidPx >= fromPx : b.invalidPx <= fromPx)) return Response.json({ error: `invalidation has to be ${b.side === "long" ? "below" : "above"} the current price` }, { status: 400 });
    if (new Date(b.deadline).getTime() <= Date.now()) return Response.json({ error: "deadline has to be in the future" }, { status: 400 });
    values.meta = { fromPx };
  }
  const [post] = await db.insert(schema.posts).values(values).returning();
  if (b.kind === "trade" && b.fadedFromId) await ensureBattle(post.id).catch(() => null);
  if (b.kind === "trade") await alertRivals(profile.id, post).catch(() => 0);
  if (b.kind === "trade" && b.backsCallId) {
    await db.update(schema.posts).set({ backedPostId: post.id }).where(and(eq(schema.posts.id, b.backsCallId), eq(schema.posts.userId, profile.id)));
  }

  // Notify the original poster when someone copies or fades them.
  if (b.kind === "trade" && (b.copiedFromId || b.fadedFromId)) {
    const srcId = b.copiedFromId ?? b.fadedFromId!;
    const [src] = await db.select({ userId: schema.posts.userId, coin: schema.posts.coin }).from(schema.posts).where(eq(schema.posts.id, srcId)).limit(1);
    if (src?.userId && src.userId !== profile.id) {
      const verb = b.copiedFromId ? "copied" : "faded";
      await notify(src.userId, verb, `${profile.handle} ${verb} your ${src.coin} trade`, `$${Math.round(b.notionalUsd)} at ${b.entryPx}`, `/post/${srcId}`);
    }
  }
  return Response.json({ post });
}

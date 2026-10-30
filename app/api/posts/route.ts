import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { queryFeed, notify } from "@/lib/feed";
import { DEMO_ENABLED, MAX_LEVERAGE, MAX_POSITION_USD } from "@/lib/config";
import { getMids } from "@/lib/hl-info";

/**
 * GET /api/posts?tab=foryou|following|live&kind=&coin=&handle=&status=&cursor=&limit=
 * Feed, newest first (pinned first on a profile), with author, votes, copies, fades, poll counts.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
  const limit = Math.min(50, Number(q.limit ?? 30));
  const cursor = Number(q.cursor ?? 0);
  const auth = await getAuth(req).catch(() => null);

  const conds = [
    q.handle ? eq(schema.users.handle, q.handle.toLowerCase()) : undefined,
    q.coin ? eq(schema.posts.coin, q.coin.toUpperCase()) : undefined,
    q.kind ? eq(schema.posts.kind, q.kind as "trade") : undefined,
    q.status === "open" || q.status === "closed" ? eq(schema.posts.status, q.status) : undefined,
    cursor ? sql`${schema.posts.id} < ${cursor}` : undefined,
  ];
  if (q.tab === "live") conds.push(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open")));
  if (q.tab === "following") {
    if (!auth) return Response.json({ posts: [], nextCursor: null });
    const f = await db.select({ id: schema.follows.followeeId }).from(schema.follows).where(eq(schema.follows.followerId, auth.privyId));
    const ids = [...f.map((x) => x.id), auth.privyId];
    conds.push(inArray(schema.posts.userId, ids));
  }
  const posts = await queryFeed({ where: and(...conds.filter(Boolean)), limit, viewerId: auth?.privyId });
  return Response.json({ posts, nextCursor: posts.length === limit ? posts[posts.length - 1].post.id : null });
}

const Trade = z.object({
  kind: z.literal("trade"),
  coin: z.string().min(1).max(20),
  side: z.enum(["long", "short"]),
  size: z.number().positive(),
  notionalUsd: z.number().positive().max(MAX_POSITION_USD * 100),
  leverage: z.number().int().min(1).max(MAX_LEVERAGE),
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

  const values: typeof schema.posts.$inferInsert = { userId: profile.id, kind: b.kind, body: "body" in b ? b.body : undefined };
  if (b.kind === "trade" && (b.paper || profile.isDemo)) {
    if (!DEMO_ENABLED && !profile.isBot) return Response.json({ error: "demo mode is off; switch to live trading in Settings" }, { status: 403 });
    // Demo: fill at the live mid on the server, deduct margin from the virtual balance.
    const mids = await getMids().catch(() => ({} as Record<string, string>));
    const mid = Number(mids[b.coin.toUpperCase()] ?? 0);
    if (!mid) return Response.json({ error: "no price for that market" }, { status: 400 });
    const margin = b.notionalUsd / b.leverage;
    if (margin > Number(profile.demoBalance)) return Response.json({ error: `demo balance is $${Number(profile.demoBalance).toFixed(2)}` }, { status: 400 });
    b.entryPx = mid;
    b.size = b.notionalUsd / mid;
    values.paper = true;
    await db.update(schema.users).set({ demoBalance: (Number(profile.demoBalance) - margin).toFixed(2) }).where(eq(schema.users.id, profile.id));
  }
  if (b.kind === "trade") {
    Object.assign(values, {
      coin: b.coin.toUpperCase(), side: b.side, size: String(b.size), notionalUsd: String(b.notionalUsd), leverage: b.leverage, entryPx: String(b.entryPx),
      oid: b.oid, copiedFromId: b.copiedFromId, fadedFromId: b.fadedFromId, tpPx: b.tpPx ? String(b.tpPx) : undefined, slPx: b.slPx ? String(b.slPx) : undefined,
    });
  } else if (b.kind === "call") {
    Object.assign(values, { coin: b.coin.toUpperCase(), side: b.side, targetPx: String(b.targetPx), invalidPx: b.invalidPx ? String(b.invalidPx) : undefined, deadline: new Date(b.deadline), callStatus: "open", backedPostId: b.backedPostId, status: "open" });
  } else if (b.kind === "poll") {
    Object.assign(values, { options: b.options, closesAt: new Date(b.closesAt), settle: b.settle ?? null, coin: b.settle?.coin, status: "open" });
  } else {
    Object.assign(values, { coin: b.coin?.toUpperCase(), status: "closed" });
  }
  if (b.kind === "trade" && b.fadedFromId) {
    const [src] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, b.fadedFromId)).limit(1);
    if (src?.userId) {
      const [owner] = await db.select({ allowFade: schema.users.allowFade }).from(schema.users).where(eq(schema.users.id, src.userId)).limit(1);
      if (owner && !owner.allowFade) return Response.json({ error: "this trader has turned fading off" }, { status: 403 });
    }
  }
  if (b.kind === "call") {
    // Remember the price when the call was made, for the progress bar and the "+12% from here" line.
    const fromPx = await getMids().then((m) => Number(m[b.coin.toUpperCase()] ?? 0)).catch(() => 0);
    values.meta = { fromPx };
  }
  const [post] = await db.insert(schema.posts).values(values).returning();
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

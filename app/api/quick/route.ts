import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { getMids } from "@/lib/hl-info";

export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;
const QUICK_COINS = ["BTC", "ETH", "SOL"] as const;

/**
 * Quick calls: "Where's BTC in an hour — higher or lower?" One tap, settles at the deadline against the
 * price it was made at. Stored as a `call` post with meta.quick so the feed, stats and streaks all count it.
 */
export type QuickState = {
  coin: string; mid: number;
  higher: number; lower: number;
  mine: { postId: number; side: "long" | "short"; fromPx: number; deadline: string } | null;
};

async function state(coin: string, userId: string | null): Promise<QuickState> {
  const mids = await getMids().catch(() => ({} as Record<string, number>));
  const now = new Date();
  const open = await db.select({ side: schema.posts.side, userId: schema.posts.userId, id: schema.posts.id, meta: schema.posts.meta, deadline: schema.posts.deadline })
    .from(schema.posts)
    .where(and(eq(schema.posts.kind, "call"), eq(schema.posts.coin, coin), eq(schema.posts.callStatus, "open"), sql`(${schema.posts.meta}->>'quick') = 'true'`, gt(schema.posts.deadline, now)));
  const mine = open.find((o) => userId && o.userId === userId);
  return {
    coin, mid: Number(mids[coin] ?? 0),
    higher: open.filter((o) => o.side === "long").length, lower: open.filter((o) => o.side === "short").length,
    mine: mine ? { postId: mine.id, side: mine.side as "long" | "short", fromPx: Number((mine.meta as { fromPx?: number })?.fromPx ?? 0), deadline: mine.deadline!.toISOString() } : null,
  };
}

/** GET /api/quick?coin=BTC → counts + the viewer's open quick call, if any. */
export async function GET(req: Request) {
  await ensureSchema();
  const coin = (new URL(req.url).searchParams.get("coin") ?? "BTC").toUpperCase();
  const auth = await getAuth(req).catch(() => null);
  return Response.json(await state(coin, auth?.privyId ?? null));
}

const Body = z.object({ coin: z.enum(QUICK_COINS), side: z.enum(["long", "short"]) });

/** POST /api/quick {coin, side} → lock in a one-hour call at the current price. One open call per coin per person. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  if (!profile) return Response.json({ error: "no profile yet" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "pick BTC, ETH or SOL and a side" }, { status: 400 });
  const { coin, side } = parsed.data;
  const cur = await state(coin, profile.id);
  if (cur.mine) return Response.json({ error: "you already have a call open on this coin", ...cur }, { status: 409 });
  if (!cur.mid) return Response.json({ error: "no price right now, try again" }, { status: 503 });
  const deadline = new Date(Date.now() + HOUR);
  const [post] = await db.insert(schema.posts).values({
    userId: profile.id, kind: "call", coin, side, targetPx: String(cur.mid), deadline, callStatus: "open", status: "open",
    body: `${side === "long" ? "Higher" : "Lower"} in an hour`, paper: profile.isDemo, meta: { fromPx: cur.mid, quick: true },
  }).returning({ id: schema.posts.id });
  return Response.json({ ok: true, postId: post.id, ...(await state(coin, profile.id)) });
}

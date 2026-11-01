import { getMids } from "@/lib/hl-info";
import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { notify } from "@/lib/feed";
import { normCoin } from "@/lib/format";

const Create = z.object({ opponent: z.string(), coin: z.string().min(1).max(20), side: z.enum(["long", "short"]), stakeUsd: z.number().min(10).max(5000), hours: z.number().int().min(1).max(168) });

/** POST /api/duels → challenge someone. Stakes are each trader's own position; nothing is pooled. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Create.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const b = parsed.data;
  const [opp] = await db.select().from(schema.users).where(eq(schema.users.handle, b.opponent.toLowerCase())).limit(1);
  if (!opp || opp.id === me.id) return Response.json({ error: "not found" }, { status: 404 });
  if (!opp.acceptDuels) return Response.json({ error: `${opp.handle} isn't accepting duels` }, { status: 403 });
  const [duel] = await db
    .insert(schema.duels)
    .values({ challengerId: me.id, opponentId: opp.id, coin: normCoin(b.coin), challengerSide: b.side, stakeUsd: String(b.stakeUsd), settlesAt: new Date(Date.now() + b.hours * 3600_000) })
    .returning();
  await notify(opp.id, "duel", `${me.handle} challenged you to a duel`, `${normCoin(b.coin)} · $${b.stakeUsd} · ${b.hours}h`, `/duels/${duel.id}`);
  return Response.json({ duel });
}

/** GET /api/duels?mine=1 → live and pending duels, newest first. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth(req).catch(() => null);
  const mine = new URL(req.url).searchParams.get("mine");
  const rows = await db
    .select()
    .from(schema.duels)
    .where(mine && auth ? or(eq(schema.duels.challengerId, auth.privyId), eq(schema.duels.opponentId, auth.privyId)) : undefined)
    .orderBy(desc(schema.duels.id))
    .limit(50);
  return Response.json({ duels: rows });
}

const Act = z.object({ id: z.number().int(), action: z.enum(["accept", "decline", "post"]), postId: z.number().int().optional(), startPx: z.number().positive().optional() });

/**
 * PATCH /api/duels → opponent: accept (with their opposing trade post id + price) or decline.
 * Challenger: "post" attaches their own position (post id) to a duel they created.
 */
export async function PATCH(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const parsed = Act.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [d] = await db.select().from(schema.duels).where(eq(schema.duels.id, parsed.data.id)).limit(1);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  // A position attached to a duel must be the caller's own open trade on the duel's coin.
  if (parsed.data.postId) {
    const [p] = await db.select({ userId: schema.posts.userId, kind: schema.posts.kind, coin: schema.posts.coin }).from(schema.posts).where(eq(schema.posts.id, parsed.data.postId)).limit(1);
    if (!p || p.userId !== auth.privyId || p.kind !== "trade" || p.coin !== d.coin) return Response.json({ error: "that position can't be used for this duel" }, { status: 400 });
  }
  if (parsed.data.action === "post") {
    if (d.challengerId !== auth.privyId || !parsed.data.postId) return Response.json({ error: "not found" }, { status: 404 });
    const [u] = await db.update(schema.duels).set({ challengerPostId: parsed.data.postId, startPx: d.startPx ?? (parsed.data.startPx ? String(parsed.data.startPx) : undefined) }).where(eq(schema.duels.id, d.id)).returning();
    return Response.json({ duel: u });
  }
  if (d.opponentId !== auth.privyId || d.status !== "pending") return Response.json({ error: "not found" }, { status: 404 });
  let startPx: string | undefined;
  if (parsed.data.action === "accept") {
    if (d.settlesAt && new Date(d.settlesAt).getTime() <= Date.now()) return Response.json({ error: "this challenge has expired" }, { status: 409 });
    // The start price is the live mid on the server, never one the client sends.
    const mid = await getMids().then((m) => Number(m[d.coin] ?? 0)).catch(() => 0);
    if (!mid) return Response.json({ error: "no live price right now, try again in a moment" }, { status: 503 });
    startPx = String(mid);
  }
  const [updated] = await db
    .update(schema.duels)
    .set(parsed.data.action === "accept" ? { status: "live", opponentPostId: parsed.data.postId, startPx } : { status: "declined" })
    .where(and(eq(schema.duels.id, d.id), eq(schema.duels.status, "pending")))
    .returning();
  if (!updated) return Response.json({ error: "already answered" }, { status: 409 });
  await notify(d.challengerId, "duel", parsed.data.action === "accept" ? "Duel accepted" : "Duel declined", `${d.coin} · $${d.stakeUsd}`, `/duels/${d.id}`);
  return Response.json({ duel: updated });
}

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { queryFeed } from "@/lib/feed";
import { getMids } from "@/lib/hl-info";

/** GET /api/posts/:id → one post in feed shape (with the viewer's vote state). */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const auth = await getAuth(req).catch(() => null);
  const [row] = await queryFeed({ where: eq(schema.posts.id, Number(id)), limit: 1, viewerId: auth?.privyId });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ post: row });
}

/** DELETE /api/posts/:id → delete your own text post or poll. Trades and calls are permanent records. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, Number(id))).limit(1);
  if (!p || p.userId !== auth.privyId) return Response.json({ error: "not found" }, { status: 404 });
  if (p.kind !== "text" && p.kind !== "poll") return Response.json({ error: "trades and calls can't be deleted" }, { status: 400 });
  await db.delete(schema.posts).where(eq(schema.posts.id, p.id));
  return Response.json({ ok: true });
}

const Patch = z.object({ tpPx: z.number().positive().nullable().optional(), slPx: z.number().positive().nullable().optional() });

/** PATCH /api/posts/:id {tpPx?, slPx?} → update take-profit / stop-loss on your own open trade (null clears). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, Number(id)), eq(schema.posts.userId, auth.privyId))).limit(1);
  if (!post || post.kind !== "trade" || post.status !== "open") return Response.json({ error: "not an open trade of yours" }, { status: 404 });
  const up = post.side === "long";
  // Checked against the live price, not the entry: a stop must still be ahead of you, so it can't be set
  // on the far side of where price already is (which would settle a loss as if it never happened).
  const mid = Number((await getMids().catch(() => ({} as Record<string, string>)))[post.coin!] ?? 0) || Number(post.entryPx);
  const { tpPx, slPx } = parsed.data;
  if (tpPx && (up ? tpPx <= mid : tpPx >= mid)) return Response.json({ error: `Take profit must be ${up ? "above" : "below"} the current price` }, { status: 400 });
  if (slPx && (up ? slPx >= mid : slPx <= mid)) return Response.json({ error: `Stop loss must be ${up ? "below" : "above"} the current price` }, { status: 400 });
  const set: Record<string, unknown> = {};
  if (tpPx !== undefined) set.tpPx = tpPx == null ? null : String(tpPx);
  if (slPx !== undefined) set.slPx = slPx == null ? null : String(slPx);
  const [updated] = await db.update(schema.posts).set(set).where(eq(schema.posts.id, post.id)).returning();
  return Response.json({ post: updated });
}

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { pnlForPosition } from "@/lib/format";
import { systemPost, notify } from "@/lib/feed";

const Body = z.object({ exitPx: z.number().positive(), reason: z.enum(["manual", "tp", "sl", "liquidation"]).default("manual") });

/** POST /api/posts/:id/close → mark closed; settles copiers vs faders into a system post when there were any. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, Number(id)), eq(schema.posts.userId, auth.privyId))).limit(1);
  if (!post || post.kind !== "trade") return Response.json({ error: "not found" }, { status: 404 });
  if (post.status === "closed") return Response.json({ post });

  const { pnl, pct } = pnlForPosition(post.side!, Number(post.entryPx), parsed.data.exitPx, Number(post.size));
  const [updated] = await db
    .update(schema.posts)
    .set({ status: "closed", exitPx: String(parsed.data.exitPx), realizedPnl: pnl.toFixed(4), closedAt: new Date(), meta: { ...(post.meta ?? {}), closeReason: parsed.data.reason } })
    .where(eq(schema.posts.id, post.id))
    .returning();

  const [me] = await db.select({ handle: schema.users.handle, showLiquidations: schema.users.showLiquidations }).from(schema.users).where(eq(schema.users.id, auth.privyId)).limit(1);
  const roi = pct * (post.leverage ?? 1);

  if (parsed.data.reason === "liquidation" && me?.showLiquidations) {
    await systemPost("liquidation", `${me.handle} got perped. ${pnl < 0 ? "−" : "+"}$${Math.abs(pnl).toFixed(0)} on ${post.coin} ${post.leverage}× ${post.side}, liquidated at ${parsed.data.exitPx}.`, { handle: me.handle, pnl, coin: post.coin, postId: post.id }, post.coin ?? undefined);
  }
  if (roi >= 100) {
    await systemPost("milestone", `${me?.handle} just hit ${(roi / 100 + 1).toFixed(1)}× on ${post.coin} ${post.side} and banked it.`, { handle: me?.handle, roi, coin: post.coin, postId: post.id }, post.coin ?? undefined);
  }
  // Settle camps: everyone who copied or faded this post.
  const [copiers, faders] = await Promise.all([
    db.select({ id: schema.posts.id, userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.copiedFromId, post.id)),
    db.select({ id: schema.posts.id, userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.fadedFromId, post.id)),
  ]);
  if (copiers.length + faders.length >= 3) {
    await systemPost("settled", `${me?.handle} ${post.coin} ${post.side} closed ${pct >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%. ${copiers.length} copied, ${faders.length} faded.`, { handle: me?.handle, coin: post.coin, roi, copiers: copiers.length, faders: faders.length, postId: post.id }, post.coin ?? undefined);
    for (const f of faders) if (f.userId) await notify(f.userId, "settled", `${me?.handle}'s ${post.coin} trade settled`, `${pct >= 0 ? "They won" : "You won"} · ${pct >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%`, `/post/${post.id}`);
  }
  return Response.json({ post: updated });
}

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { pnlForPosition } from "@/lib/format";

const Body = z.object({ exitPx: z.number().positive() });

/** POST /api/posts/:id/close → mark a post closed after the client closed it on Hyperliquid. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const [post] = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.id, Number(id)), eq(schema.posts.userId, auth.privyId)))
    .limit(1);
  if (!post) return Response.json({ error: "not found" }, { status: 404 });
  if (post.status === "closed") return Response.json({ post });

  const { pnl } = pnlForPosition(post.side, Number(post.entryPx), parsed.data.exitPx, Number(post.size));
  const [updated] = await db
    .update(schema.posts)
    .set({ status: "closed", exitPx: String(parsed.data.exitPx), realizedPnl: pnl.toFixed(4), closedAt: new Date() })
    .where(eq(schema.posts.id, post.id))
    .returning();
  return Response.json({ post: updated });
}

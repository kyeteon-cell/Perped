import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

/** POST /api/posts/:id/pin → toggle a pin on one of your own CLOSED trades (pins are always verified results). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, Number(id)), eq(schema.posts.userId, auth.privyId))).limit(1);
  if (!post) return Response.json({ error: "not found" }, { status: 404 });
  if (post.kind === "trade" && post.status !== "closed") return Response.json({ error: "only closed trades can be pinned" }, { status: 400 });
  const [updated] = await db.update(schema.posts).set({ pinned: !post.pinned }).where(eq(schema.posts.id, post.id)).returning();
  return Response.json({ pinned: updated.pinned });
}

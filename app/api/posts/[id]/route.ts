import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { queryFeed } from "@/lib/feed";

/** GET /api/posts/:id → one post in feed shape (with the viewer's vote state). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { notify } from "@/lib/feed";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const rows = await db
    .select({ comment: schema.comments, author: { handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, verified: schema.users.verified } })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
    .where(eq(schema.comments.postId, Number(id)))
    .orderBy(asc(schema.comments.id))
    .limit(300);
  return Response.json({ comments: rows });
}

const Body = z.object({ body: z.string().trim().min(1).max(500), parentId: z.number().int().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  if (!profile) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [comment] = await db.insert(schema.comments).values({ postId: Number(id), userId: profile.id, body: parsed.data.body, parentId: parsed.data.parentId }).returning();
  const [post] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, Number(id))).limit(1);
  if (post?.userId && post.userId !== profile.id) await notify(post.userId, "reply", `${profile.handle} commented on your post`, parsed.data.body.slice(0, 80), `/post/${id}`);
  return Response.json({ comment: { comment, author: { handle: profile.handle, avatarUrl: profile.avatarUrl, verified: profile.verified } } });
}

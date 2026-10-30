import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

const Body = z.object({ option: z.number().int().min(0).max(3) });

/** POST /api/posts/:id/poll {option} → vote in a poll (one vote per user, changeable until it closes). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const postId = Number(id);
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post || post.kind !== "poll") return Response.json({ error: "not a poll" }, { status: 400 });
  if (post.closesAt && post.closesAt.getTime() < Date.now()) return Response.json({ error: "poll closed" }, { status: 400 });
  if (!post.options || parsed.data.option >= post.options.length) return Response.json({ error: "bad option" }, { status: 400 });
  await db.insert(schema.pollVotes).values({ postId, userId: auth.privyId, option: parsed.data.option }).onConflictDoUpdate({ target: [schema.pollVotes.postId, schema.pollVotes.userId], set: { option: parsed.data.option } });
  return Response.json({ ok: true });
}

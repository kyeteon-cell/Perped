import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

const Body = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

/** POST /api/posts/:id/vote {value: 1|-1} → toggles; same value again removes, other value switches. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const postId = Number(id);
  // Calls lock once they resolve: no voting after you know the answer.
  const [p] = await db.select({ kind: schema.posts.kind, callStatus: schema.posts.callStatus }).from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  if (p.kind === "call" && p.callStatus && p.callStatus !== "open") return Response.json({ error: "this call has resolved, voting is closed" }, { status: 409 });
  const where = and(eq(schema.votes.postId, postId), eq(schema.votes.userId, auth.privyId));
  const [existing] = await db.select().from(schema.votes).where(where).limit(1);
  if (existing?.value === parsed.data.value) {
    await db.delete(schema.votes).where(where);
    return Response.json({ myVote: null });
  }
  await db.insert(schema.votes).values({ postId, userId: auth.privyId, value: parsed.data.value }).onConflictDoUpdate({ target: [schema.votes.postId, schema.votes.userId], set: { value: parsed.data.value } });
  return Response.json({ myVote: parsed.data.value });
}

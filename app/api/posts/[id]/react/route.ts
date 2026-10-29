import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

const Body = z.object({ kind: z.enum(["fire", "skull", "ape"]) });

/** POST /api/posts/:id/react → toggle a reaction. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const postId = Number(id);
  const where = and(eq(schema.reactions.postId, postId), eq(schema.reactions.userId, auth.privyId), eq(schema.reactions.kind, parsed.data.kind));
  const existing = await db.select({ id: schema.reactions.id }).from(schema.reactions).where(where).limit(1);
  if (existing[0]) {
    await db.delete(schema.reactions).where(eq(schema.reactions.id, existing[0].id));
    return Response.json({ reacted: false });
  }
  await db.insert(schema.reactions).values({ postId, userId: auth.privyId, kind: parsed.data.kind });
  return Response.json({ reacted: true });
}

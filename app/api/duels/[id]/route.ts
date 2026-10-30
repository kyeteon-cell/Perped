import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/duels/:id → the duel with both traders and their posts, plus which side the viewer is on. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await ctx.params;
  const [d] = await db.select().from(schema.duels).where(eq(schema.duels.id, Number(id))).limit(1);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  const auth = await getAuth(req).catch(() => null);
  const who = (uid: string) => db.select({ id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, isDemo: schema.users.isDemo }).from(schema.users).where(eq(schema.users.id, uid)).limit(1);
  const post = (pid: number | null) => (pid ? db.select().from(schema.posts).where(eq(schema.posts.id, pid)).limit(1) : Promise.resolve([]));
  const [[challenger], [opponent], [cPost], [oPost]] = await Promise.all([who(d.challengerId), who(d.opponentId), post(d.challengerPostId), post(d.opponentPostId)]);
  return Response.json({ duel: d, challenger, opponent, challengerPost: cPost ?? null, opponentPost: oPost ?? null, role: auth?.privyId === d.challengerId ? "challenger" : auth?.privyId === d.opponentId ? "opponent" : "viewer" });
}

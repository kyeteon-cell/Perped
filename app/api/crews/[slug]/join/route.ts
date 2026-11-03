import { and, eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { crewBySlug, crewOf, joinCrew } from "@/lib/crews";

export const dynamic = "force-dynamic";

/** POST /api/crews/:slug/join → join (or switch to) this crew. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  const { slug } = await ctx.params;
  const crew = await crewBySlug(slug);
  if (!crew) return Response.json({ error: "That crew doesn't exist" }, { status: 404 });
  // ?auto=1 (a link from a crew's group): only join people who aren't in a crew yet, never switch anyone silently.
  if (new URL(req.url).searchParams.get("auto") === "1" && (await crewOf(me.id))) return Response.json({ ok: true, skipped: true });
  const r = await joinCrew(me, crew);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  return Response.json(r);
}

/** DELETE /api/crews/:slug/join → leave. Owners can't leave their own crew. */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { slug } = await ctx.params;
  const mine = await crewOf(auth.privyId);
  if (!mine || mine.slug !== slug) return Response.json({ ok: true });
  if (mine.isOwner) return Response.json({ error: "You run this crew, so you can't leave it" }, { status: 409 });
  await db.delete(schema.crewMembers).where(and(eq(schema.crewMembers.userId, auth.privyId), eq(schema.crewMembers.crewId, mine.id)));
  return Response.json({ ok: true });
}

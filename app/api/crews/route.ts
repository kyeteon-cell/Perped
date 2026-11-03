import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { CREW_BIO_MAX, CREW_NAME_MAX, CREW_TAG_RE, crewBoard, crewOf, slugify } from "@/lib/crews";

export const dynamic = "force-dynamic";

/** GET /api/crews → this week's crew war (every crew, best first) and the viewer's own crew. */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req).catch(() => null);
  const [board, mine] = await Promise.all([
    crewBoard(100).catch((e) => { console.error("[crews] board", e); return []; }),
    auth ? crewOf(auth.privyId).catch(() => null) : Promise.resolve(null),
  ]);
  return Response.json({ board, mine: mine ? { slug: mine.slug, name: mine.name, tag: mine.tag, isOwner: mine.isOwner } : null, weekEndsAt: nextMonday() });
}

function nextMonday() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString();
}

const Body = z.object({
  name: z.string().trim().min(3).max(CREW_NAME_MAX),
  tag: z.string().trim().toUpperCase().regex(CREW_TAG_RE),
  bio: z.string().trim().max(CREW_BIO_MAX).optional(),
});

/** POST /api/crews {name, tag, bio?} → start a crew. You run it and you're its first member. */
export async function POST(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  if (me.isBot) return Response.json({ error: "Bots can't run crews" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Name 3–28 characters, tag 2–5 letters or numbers" }, { status: 400 });
  const { name, tag, bio } = parsed.data;
  const mine = await crewOf(me.id);
  if (mine?.isOwner) return Response.json({ error: "You already run a crew", slug: mine.slug }, { status: 409 });
  const base = slugify(name);
  if (base.length < 3) return Response.json({ error: "Use a few letters in the name" }, { status: 400 });
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [taken] = await db.select({ id: schema.crews.id }).from(schema.crews).where(eq(schema.crews.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base.slice(0, 21)}-${i}`;
  }
  const [crew] = await db.insert(schema.crews).values({ slug, name, tag, bio: bio || null, ownerId: me.id }).returning();
  await db.insert(schema.crewMembers).values({ userId: me.id, crewId: crew.id }).onConflictDoUpdate({ target: schema.crewMembers.userId, set: { crewId: crew.id, joinedAt: new Date() } });
  return Response.json({ ok: true, slug: crew.slug });
}

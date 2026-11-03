import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { CREW_BIO_MAX, CREW_NAME_MAX, CREW_TAG_RE, crewBySlug, crewDetail, crewOf } from "@/lib/crews";
import { BUILDER_FEE_REFERRED_TENTHS_BPS } from "@/lib/config";
import { FOUNDER_L1_PCT, isFounder } from "@/lib/programme-rates";
import { REFERRAL_SHARE_PCT } from "@/lib/config";
import { TELEGRAM_BOT_USERNAME, TELEGRAM_ON } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** GET /api/crews/:slug → the crew, its members (best 30-day PnL first) and the viewer's place in it. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const { slug } = await ctx.params;
  const d = await crewDetail(slug);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  const auth = await getAuth(req).catch(() => null);
  const mine = auth ? await crewOf(auth.privyId).catch(() => null) : null;
  const isOwner = !!auth && auth.privyId === d.ownerId;
  let owner: { invitePct: number } | null = null;
  if (isOwner) {
    const [u] = await db.select({ founderSeat: schema.users.founderSeat, founderStatus: schema.users.founderStatus }).from(schema.users).where(eq(schema.users.id, d.ownerId)).limit(1);
    owner = { invitePct: u && isFounder(u) ? FOUNDER_L1_PCT : REFERRAL_SHARE_PCT };
  }
  return Response.json({
    crew: d.crew, members: d.members,
    viewer: { member: mine?.id === d.crewId, isOwner, otherCrew: mine && mine.id !== d.crewId ? { slug: mine.slug, name: mine.name, isOwner: mine.isOwner } : null },
    owner, referredFeeBps: BUILDER_FEE_REFERRED_TENTHS_BPS / 10,
    telegram: { available: TELEGRAM_ON, bot: TELEGRAM_BOT_USERNAME || null },
  });
}

const Patch = z.object({
  name: z.string().trim().min(3).max(CREW_NAME_MAX).optional(),
  tag: z.string().trim().toUpperCase().regex(CREW_TAG_RE).optional(),
  bio: z.string().trim().max(CREW_BIO_MAX).optional(),
  tgMembers: z.boolean().optional(),
});

/** PATCH /api/crews/:slug {name?, tag?, bio?, tgMembers?} → owner edits. The link (slug) never changes. */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { slug } = await ctx.params;
  const c = await crewBySlug(slug);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  if (c.ownerId !== auth.privyId) return Response.json({ error: "Only the crew owner can change this" }, { status: 403 });
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: "Name 3–28 characters, tag 2–5 letters or numbers" }, { status: 400 });
  const set = { ...p.data, ...(p.data.bio !== undefined ? { bio: p.data.bio || null } : {}) };
  if (Object.keys(set).length) await db.update(schema.crews).set(set).where(eq(schema.crews.id, c.id));
  return Response.json({ ok: true });
}

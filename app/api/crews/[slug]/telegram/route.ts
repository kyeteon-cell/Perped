import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { crewBySlug } from "@/lib/crews";
import { TELEGRAM_BOT_USERNAME, TELEGRAM_ON } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function ownCrew(req: Request, slug: string) {
  const auth = await getAuth(req);
  if (!auth) return { res: unauthorized() } as const;
  const c = await crewBySlug(slug);
  if (!c) return { res: Response.json({ error: "not found" }, { status: 404 }) } as const;
  if (c.ownerId !== auth.privyId) return { res: Response.json({ error: "Only the crew owner can do this" }, { status: 403 }) } as const;
  return { crew: c } as const;
}

/** POST /api/crews/:slug/telegram → a fresh one-time code the owner sends in their group as `/link CODE`. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const o = await ownCrew(req, (await ctx.params).slug);
  if ("res" in o) return o.res;
  if (!TELEGRAM_ON) return Response.json({ error: "The Perped Telegram bot isn't switched on yet" }, { status: 503 });
  const code = randomBytes(4).toString("hex").toUpperCase();
  await db.update(schema.crews).set({ tgLinkCode: code }).where(eq(schema.crews.id, o.crew.id));
  return Response.json({ code, bot: TELEGRAM_BOT_USERNAME || null, linked: o.crew.tgChatId ? { title: o.crew.tgChatTitle } : null });
}

/** DELETE /api/crews/:slug/telegram → stop posting to the linked group. */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  const o = await ownCrew(req, (await ctx.params).slug);
  if ("res" in o) return o.res;
  await db.update(schema.crews).set({ tgChatId: null, tgChatTitle: null, tgLinkCode: null }).where(eq(schema.crews.id, o.crew.id));
  return Response.json({ ok: true });
}

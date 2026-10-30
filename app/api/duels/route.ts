import { z } from "zod";
import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { notify } from "@/lib/feed";

const Create = z.object({ opponent: z.string(), coin: z.string().min(1).max(20), side: z.enum(["long", "short"]), stakeUsd: z.number().min(10).max(5000), hours: z.number().int().min(1).max(168) });

/** POST /api/duels → challenge someone. Stakes are each trader's own position; nothing is pooled. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Create.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const b = parsed.data;
  const [opp] = await db.select().from(schema.users).where(eq(schema.users.handle, b.opponent.toLowerCase())).limit(1);
  if (!opp || opp.id === me.id) return Response.json({ error: "not found" }, { status: 404 });
  if (!opp.acceptDuels) return Response.json({ error: `${opp.handle} isn't accepting duels` }, { status: 403 });
  const [duel] = await db
    .insert(schema.duels)
    .values({ challengerId: me.id, opponentId: opp.id, coin: b.coin.toUpperCase(), challengerSide: b.side, stakeUsd: String(b.stakeUsd), settlesAt: new Date(Date.now() + b.hours * 3600_000) })
    .returning();
  await notify(opp.id, "duel", `${me.handle} challenged you to a duel`, `${b.coin.toUpperCase()} · $${b.stakeUsd} · ${b.hours}h`, `/duels/${duel.id}`);
  return Response.json({ duel });
}

/** GET /api/duels?mine=1 → live and pending duels, newest first. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth(req).catch(() => null);
  const mine = new URL(req.url).searchParams.get("mine");
  const rows = await db
    .select()
    .from(schema.duels)
    .where(mine && auth ? or(eq(schema.duels.challengerId, auth.privyId), eq(schema.duels.opponentId, auth.privyId)) : undefined)
    .orderBy(desc(schema.duels.id))
    .limit(50);
  return Response.json({ duels: rows });
}

const Act = z.object({ id: z.number().int(), action: z.enum(["accept", "decline"]), postId: z.number().int().optional(), startPx: z.number().positive().optional() });

/** PATCH /api/duels → accept (with your opposing trade post id) or decline. */
export async function PATCH(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const parsed = Act.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [d] = await db.select().from(schema.duels).where(eq(schema.duels.id, parsed.data.id)).limit(1);
  if (!d || d.opponentId !== auth.privyId || d.status !== "pending") return Response.json({ error: "not found" }, { status: 404 });
  const [updated] = await db
    .update(schema.duels)
    .set(parsed.data.action === "accept" ? { status: "live", opponentPostId: parsed.data.postId, startPx: parsed.data.startPx ? String(parsed.data.startPx) : undefined } : { status: "declined" })
    .where(eq(schema.duels.id, d.id))
    .returning();
  await notify(d.challengerId, "duel", parsed.data.action === "accept" ? "Duel accepted" : "Duel declined", `${d.coin} · $${d.stakeUsd}`, `/duels/${d.id}`);
  return Response.json({ duel: updated });
}

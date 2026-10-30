import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { callOut, setMute, sideOf } from "@/lib/rivalries";

export const dynamic = "force-dynamic";

export type RivalRow = { handle: string; avatarUrl: string | null; xp: number; mine: number; theirs: number; draws: number; fights: number; calledByMe: boolean; calledByThem: boolean; muted: boolean; runHolderIsMe: boolean | null; runLen: number };

/** GET /api/rivalries?handle=x → x's active rivals, most-fought first. */
export async function GET(req: Request) {
  await ensureSchema();
  const handle = (new URL(req.url).searchParams.get("handle") ?? "").toLowerCase();
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (!u) return Response.json({ rivals: [] });
  const rows = await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.active, true), or(eq(schema.rivalries.userA, u.id), eq(schema.rivalries.userB, u.id)))).orderBy(desc(schema.rivalries.fights)).limit(20);
  const others = rows.map((r) => sideOf(r, u.id).other);
  const people = others.length ? await db.select({ id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, xp: schema.users.xp }).from(schema.users).where(or(...others.map((id) => eq(schema.users.id, id)))) : [];
  const rivals: RivalRow[] = rows.map((r) => {
    const s = sideOf(r, u.id), p = people.find((x) => x.id === s.other);
    return p ? { handle: p.handle, avatarUrl: p.avatarUrl, xp: p.xp, mine: s.mine, theirs: s.theirs, draws: r.draws, fights: r.fights, calledByMe: r.calledBy === u.id, calledByThem: !!r.calledBy && r.calledBy !== u.id, muted: s.muted, runHolderIsMe: r.runHolder ? r.runHolder === u.id : null, runLen: r.runLen } : null;
  }).filter((x): x is RivalRow => !!x);
  return Response.json({ rivals });
}

const Body = z.object({ handle: z.string().min(1), action: z.enum(["call", "mute", "unmute"]) });

/** POST /api/rivalries {handle, action: call | mute | unmute} */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [them] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, parsed.data.handle.toLowerCase())).limit(1);
  if (!them || them.id === me.id) return Response.json({ error: "not found" }, { status: 404 });
  if (parsed.data.action === "call") await callOut(me.id, them.id);
  else await setMute(me.id, them.id, parsed.data.action === "mute");
  return Response.json({ ok: true });
}

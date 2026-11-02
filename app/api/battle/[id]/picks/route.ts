import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { PICK_UPSET_XP, PICK_XP } from "@/lib/picks";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** The fight (by its fade post id, like /battle/:id), with both legs' status. */
async function fight(id: number) {
  const [b] = rows(await db.execute(sql`select b.id, b.status, b.fader_id, b.target_id, b.winner_id, fp.status as fs, tp.status as ts
    from battles b join posts fp on fp.id = b.fader_post_id join posts tp on tp.id = b.target_post_id where b.fader_post_id = ${id} limit 1`));
  return b ?? null;
}

async function tally(battleId: number, uid?: string) {
  const [c] = rows(await db.execute(sql`select count(*) filter (where pick = 'fader')::int as fader, count(*) filter (where pick = 'target')::int as target
    ${uid ? sql`, max(case when user_id = ${uid} then pick end) as mine` : sql`, null as mine`} from battle_picks where battle_id = ${battleId}`));
  return { fader: Number(c?.fader ?? 0), target: Number(c?.target ?? 0), mine: (c?.mine as string | null) ?? null };
}

/** GET → pick counts, your pick, and whether picks are still open. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const b = await fight(id);
  if (!b) return Response.json({ error: "not found" }, { status: 404 });
  const auth = await getAuth(req).catch(() => null);
  const t = await tally(Number(b.id), auth?.privyId);
  const inIt = !!auth && (auth.privyId === b.fader_id || auth.privyId === b.target_id);
  const open = b.status === "open" && b.fs === "open" && b.ts === "open";
  return Response.json({ ...t, open, inIt, settled: b.status === "settled", winner: b.winner_id ? (b.winner_id === b.fader_id ? "fader" : "target") : null, xp: PICK_XP, upsetXp: PICK_UPSET_XP }, { headers: { "cache-control": "private, no-store" } });
}

/** POST {pick: "fader" | "target"} → back a side. One pick per fight, while both fighters are still in. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const id = Number((await params).id);
  const body = await req.json().catch(() => null) as { pick?: string } | null;
  const pick = body?.pick === "fader" || body?.pick === "target" ? body.pick : null;
  if (!pick) return Response.json({ error: "Pick a side" }, { status: 400 });
  const b = await fight(id);
  if (!b) return Response.json({ error: "not found" }, { status: 404 });
  if (auth.privyId === b.fader_id || auth.privyId === b.target_id) return Response.json({ error: "You're in this fight" }, { status: 409 });
  if (!(b.status === "open" && b.fs === "open" && b.ts === "open")) return Response.json({ error: "Picks are closed: someone has already closed" }, { status: 409 });
  const ins = rows(await db.execute(sql`insert into battle_picks (battle_id, user_id, pick) values (${Number(b.id)}, ${auth.privyId}, ${pick}) on conflict (battle_id, user_id) do nothing returning id`));
  if (!ins.length) return Response.json({ error: "You've already picked", ...(await tally(Number(b.id), auth.privyId)) }, { status: 409 });
  return Response.json({ ok: true, ...(await tally(Number(b.id), auth.privyId)) });
}

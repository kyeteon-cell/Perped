import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { getRivalry } from "@/lib/rivalries";
import { pnlForPosition } from "@/lib/format";

export const dynamic = "force-dynamic";

type Side = { id: string; handle: string; avatarUrl: string | null; xp: number; bannerUrl: string | null };
export type Fight = { kind: "battle" | "duel"; id: number; href: string; coin: string; at: string; winner: string | null; roiA: number | null; roiB: number | null; pnlA: number; pnlB: number };
export type PairRes = { a: Side; b: Side; aWins: number; bWins: number; draws: number; fights: number; active: boolean; calledBy: string | null; runHolder: string | null; runLen: number; bestRunHolder: string | null; bestRun: number; pnlA: number; pnlB: number; history: Fight[]; viewer: { isA: boolean; isB: boolean; muted: boolean } };

/** GET /api/rivalries/pair?a=handle&b=handle → the full series between two traders. */
export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const ha = (url.searchParams.get("a") ?? "").toLowerCase(), hb = (url.searchParams.get("b") ?? "").toLowerCase();
  const two = await db.select({ id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, xp: schema.users.xp, bannerUrl: schema.users.bannerUrl }).from(schema.users).where(inArray(schema.users.handle, [ha, hb]));
  const A = two.find((u) => u.handle === ha), B = two.find((u) => u.handle === hb);
  if (!A || !B || A.id === B.id) return Response.json({ error: "not found" }, { status: 404 });
  const r = await getRivalry(A.id, B.id);
  if (!r) return Response.json({ error: "not found" }, { status: 404 });
  const flip = r.userA !== A.id; // the row stores ids sorted; present it as A vs B as requested

  const battles = await db.select().from(schema.battles).where(and(eq(schema.battles.status, "settled"), or(
    and(eq(schema.battles.faderId, A.id), eq(schema.battles.targetId, B.id)),
    and(eq(schema.battles.faderId, B.id), eq(schema.battles.targetId, A.id)),
  ))).orderBy(desc(schema.battles.settledAt)).limit(100);
  const duels = await db.select().from(schema.duels).where(and(eq(schema.duels.status, "settled"), or(
    and(eq(schema.duels.challengerId, A.id), eq(schema.duels.opponentId, B.id)),
    and(eq(schema.duels.challengerId, B.id), eq(schema.duels.opponentId, A.id)),
  ))).orderBy(desc(schema.duels.settlesAt)).limit(100);
  const postIds = battles.flatMap((b) => [b.faderPostId, b.targetPostId]);
  const posts = postIds.length ? await db.select({ id: schema.posts.id, userId: schema.posts.userId, side: schema.posts.side, entryPx: schema.posts.entryPx, exitPx: schema.posts.exitPx, size: schema.posts.size, realizedPnl: schema.posts.realizedPnl }).from(schema.posts).where(inArray(schema.posts.id, postIds)) : [];
  const pnlOf = (id: number) => { const p = posts.find((x) => x.id === id); if (!p) return 0; if (p.realizedPnl != null) return Number(p.realizedPnl); const e = Number(p.entryPx), x = Number(p.exitPx ?? e); return pnlForPosition(p.side as "long" | "short", e, x, Number(p.size)).pnl; };

  const history: Fight[] = [
    ...battles.map((b) => { const aIsFader = b.faderId === A.id; return { kind: "battle" as const, id: b.id, href: `/battle/${b.faderPostId}`, coin: b.coin, at: (b.settledAt ?? b.createdAt).toISOString(), winner: b.winnerId === A.id ? A.handle : b.winnerId === B.id ? B.handle : null, roiA: Number(aIsFader ? b.faderRoi : b.targetRoi), roiB: Number(aIsFader ? b.targetRoi : b.faderRoi), pnlA: pnlOf(aIsFader ? b.faderPostId : b.targetPostId), pnlB: pnlOf(aIsFader ? b.targetPostId : b.faderPostId) }; }),
    ...duels.map((d) => ({ kind: "duel" as const, id: d.id, href: `/duels/${d.id}`, coin: d.coin, at: d.settlesAt.toISOString(), winner: d.winnerId === A.id ? A.handle : d.winnerId === B.id ? B.handle : null, roiA: null, roiB: null, pnlA: 0, pnlB: 0 })),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  const auth = await getAuth(req).catch(() => null);
  const isA = auth?.privyId === A.id, isB = auth?.privyId === B.id;
  const mutedForViewer = isA ? (flip ? r.mutedB : r.mutedA) : isB ? (flip ? r.mutedA : r.mutedB) : false;
  const res: PairRes = {
    a: A, b: B, aWins: flip ? r.bWins : r.aWins, bWins: flip ? r.aWins : r.bWins, draws: r.draws, fights: r.fights, active: r.active, calledBy: r.calledBy === A.id ? A.handle : r.calledBy === B.id ? B.handle : null,
    runHolder: r.runHolder === A.id ? A.handle : r.runHolder === B.id ? B.handle : null, runLen: r.runLen, bestRunHolder: r.bestRunHolder === A.id ? A.handle : r.bestRunHolder === B.id ? B.handle : null, bestRun: r.bestRun,
    pnlA: history.reduce((s, f) => s + f.pnlA, 0), pnlB: history.reduce((s, f) => s + f.pnlB, 0), history, viewer: { isA, isB, muted: mutedForViewer },
  };
  return Response.json(res);
}

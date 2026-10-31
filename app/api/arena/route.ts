import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Mini = { id: string; handle: string; avatarUrl: string | null; xp: number };
type Leg = { postId: number; side: "long" | "short"; entryPx: number; size: number; leverage: number; status: string; exitPx: number | null };
export type ArenaBattle = { id: number; faderPostId: number; coin: string; status: "open" | "settled"; winnerId: string | null; fader: Mini; target: Mini; faderLeg: Leg; targetLeg: Leg; faderRoi: number | null; targetRoi: number | null; settledAt: string | null; createdAt: string; reason: string | null; nemesis?: Nemesis | null };
/** Set when the two fighters are sworn rivals (an active rivalry): the series so far, from the fader's side. */
export type Nemesis = { fights: number; faderWins: number; targetWins: number; draws: number; meeting: number };
export type ArenaRes = {
  live: ArenaBattle[];
  rekt: ArenaBattle[];
  recent: ArenaBattle[];
  streaks: { user: Mini; streak: number }[];
  me: null | { won: number; lost: number; drawn: number; streak: number; best: number; rivals: { user: Mini; won: number; lost: number }[]; challenges: { id: number; coin: string; side: "long" | "short"; stakeUsd: number; hours: number; from: Mini }[] };
};

/** GET /api/arena → the PvP hub: live battles, recent results, hot streaks, and (signed in) your record, rivals and incoming challenges. */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req).catch(() => null);
  const rows = await db.select().from(schema.battles).orderBy(desc(schema.battles.createdAt)).limit(600);
  const userIds = [...new Set(rows.flatMap((b) => [b.faderId, b.targetId]))];
  const postIds = [...new Set(rows.flatMap((b) => [b.faderPostId, b.targetPostId]))];
  const [users, posts] = await Promise.all([
    userIds.length ? db.select({ id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, xp: schema.users.xp }).from(schema.users).where(inArray(schema.users.id, userIds)) : Promise.resolve([] as Mini[]),
    postIds.length ? db.select({ id: schema.posts.id, side: schema.posts.side, entryPx: schema.posts.entryPx, size: schema.posts.size, leverage: schema.posts.leverage, status: schema.posts.status, exitPx: schema.posts.exitPx }).from(schema.posts).where(inArray(schema.posts.id, postIds)) : Promise.resolve([]),
  ]);
  const U = new Map(users.map((u) => [u.id, u as Mini]));
  // Active rivalries among these fighters: those battles are nemesis matches.
  // A nemesis is your #1 rival: the pair is each other's most-fought opponent, or one called the other out.
  const riv = userIds.length ? await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.active, true), or(inArray(schema.rivalries.userA, userIds), inArray(schema.rivalries.userB, userIds)))) : [];
  const top = new Map<string, number>();
  for (const r of riv) for (const u of [r.userA, r.userB]) top.set(u, Math.max(top.get(u) ?? 0, r.fights));
  const R = new Map(riv.filter((r) => r.calledBy || (r.fights >= (top.get(r.userA) ?? 0) && r.fights >= (top.get(r.userB) ?? 0))).map((r) => [`${r.userA}|${r.userB}`, r]));
  const nemesisOf = (f: string, t: string): Nemesis | null => {
    const r = R.get(f < t ? `${f}|${t}` : `${t}|${f}`); if (!r) return null;
    const fIsA = r.userA === f;
    return { fights: r.fights, faderWins: fIsA ? r.aWins : r.bWins, targetWins: fIsA ? r.bWins : r.aWins, draws: r.draws, meeting: r.fights + 1 };
  };
  const P = new Map(posts.map((p) => [p.id, p]));
  const leg = (id: number): Leg => { const p = P.get(id); return { postId: id, side: (p?.side ?? "long") as "long" | "short", entryPx: Number(p?.entryPx ?? 0), size: Number(p?.size ?? 0), leverage: p?.leverage ?? 1, status: p?.status ?? "closed", exitPx: p?.exitPx ? Number(p.exitPx) : null }; };
  const shape = (b: typeof rows[number]): ArenaBattle | null => {
    const f = U.get(b.faderId), t = U.get(b.targetId);
    if (!f || !t) return null;
    return { id: b.id, faderPostId: b.faderPostId, coin: b.coin, status: b.status as "open" | "settled", winnerId: b.winnerId, fader: f, target: t, faderLeg: leg(b.faderPostId), targetLeg: leg(b.targetPostId), faderRoi: b.faderRoi != null ? Number(b.faderRoi) : null, targetRoi: b.targetRoi != null ? Number(b.targetRoi) : null, settledAt: b.settledAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(), reason: b.reason ?? null, nemesis: nemesisOf(b.faderId, b.targetId) };
  };

  const live = rows.filter((b) => b.status === "open").map(shape).filter((x): x is ArenaBattle => !!x && x.faderLeg.status === "open" && x.targetLeg.status === "open").slice(0, 80);
  const settled = rows.filter((b) => b.status === "settled").sort((a, b) => (b.settledAt?.getTime() ?? 0) - (a.settledAt?.getTime() ?? 0));
  const recent = settled.slice(0, 12).map(shape).filter((x): x is ArenaBattle => !!x);
  // Liquidations in the last hour stay in Bloodbath as REKT cards.
  const rekt = settled.filter((b) => b.reason === "liquidation" && b.settledAt && Date.now() - b.settledAt.getTime() < 6 * 3_600_000).slice(0, 10).map(shape).filter((x): x is ArenaBattle => !!x);

  // Current win streak per user: consecutive wins counting back from their latest settled battle.
  const byUser = new Map<string, boolean[]>(); // newest first; true = win, false = loss (draws break nothing)
  for (const b of settled) {
    for (const uid of [b.faderId, b.targetId]) {
      if (!b.winnerId) continue;
      const arr = byUser.get(uid) ?? []; arr.push(b.winnerId === uid); byUser.set(uid, arr);
    }
  }
  const streakOf = (arr: boolean[]) => { let n = 0; for (const w of arr) { if (w) n++; else break; } return n; };
  const bestOf = (arr: boolean[]) => { let best = 0, run = 0; for (const w of [...arr].reverse()) { run = w ? run + 1 : 0; best = Math.max(best, run); } return best; };
  const streaks = [...byUser.entries()].map(([uid, arr]) => ({ user: U.get(uid)!, streak: streakOf(arr) })).filter((s) => s.user && s.streak >= 2).sort((a, b) => b.streak - a.streak).slice(0, 8);

  let me: ArenaRes["me"] = null;
  if (auth) {
    const mine = settled.filter((b) => b.faderId === auth.privyId || b.targetId === auth.privyId);
    const won = mine.filter((b) => b.winnerId === auth.privyId).length;
    const drawn = mine.filter((b) => !b.winnerId).length;
    const arr = byUser.get(auth.privyId) ?? [];
    const rivalMap = new Map<string, { won: number; lost: number }>();
    for (const b of mine) {
      const opp = b.faderId === auth.privyId ? b.targetId : b.faderId;
      const r = rivalMap.get(opp) ?? { won: 0, lost: 0 };
      if (b.winnerId === auth.privyId) r.won++; else if (b.winnerId) r.lost++;
      rivalMap.set(opp, r);
    }
    const rivals = [...rivalMap.entries()].map(([uid, r]) => ({ user: U.get(uid)!, ...r })).filter((r) => r.user).sort((a, b) => b.won + b.lost - (a.won + a.lost)).slice(0, 6);
    const duels = await db.select().from(schema.duels).where(and(eq(schema.duels.opponentId, auth.privyId), eq(schema.duels.status, "pending"))).orderBy(desc(schema.duels.createdAt)).limit(10);
    const fromIds = [...new Set(duels.map((d) => d.challengerId))];
    const from = fromIds.length ? await db.select({ id: schema.users.id, handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, xp: schema.users.xp }).from(schema.users).where(or(...fromIds.map((id) => eq(schema.users.id, id)))) : [];
    const challenges = duels.map((d) => ({ id: d.id, coin: d.coin, side: d.challengerSide as "long" | "short", stakeUsd: Number(d.stakeUsd), hours: Math.max(1, Math.round((d.settlesAt.getTime() - d.createdAt.getTime()) / 3_600_000)), from: from.find((f) => f.id === d.challengerId) as Mini })).filter((c) => c.from);
    me = { won, lost: mine.length - won - drawn, drawn, streak: streakOf(arr), best: bestOf(arr), rivals, challenges };
  }
  return Response.json({ live, rekt, recent, streaks, me } satisfies ArenaRes);
}

import { and, asc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify, systemPost } from "./feed";
import { awardXp } from "./xp";

export const RIVAL_AT = 3; // fights before two traders become rivals automatically
const ALERT_GAP_MS = 30 * 60 * 1000; // at most one "your rival just traded" alert per rival per 30 min

type U = { id: string; handle: string; isBot: boolean };
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]) as [string, string];

async function users(ids: string[]) {
  const rows = await db.select({ id: schema.users.id, handle: schema.users.handle, isBot: schema.users.isBot }).from(schema.users).where(sql`${schema.users.id} in ${ids}`);
  return new Map(rows.map((r) => [r.id, r as U]));
}

/** Fetch (or create) the rivalry row for two users. */
export async function getRivalry(x: string, y: string) {
  const [a, b] = pair(x, y);
  const [row] = await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.userA, a), eq(schema.rivalries.userB, b))).limit(1);
  if (row) return row;
  const [made] = await db.insert(schema.rivalries).values({ userA: a, userB: b }).onConflictDoNothing().returning();
  if (made) return made;
  const [again] = await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.userA, a), eq(schema.rivalries.userB, b))).limit(1);
  return again;
}

/** Score from one side's point of view. */
export function sideOf(r: typeof schema.rivalries.$inferSelect, me: string) {
  const isA = r.userA === me;
  return { mine: isA ? r.aWins : r.bWins, theirs: isA ? r.bWins : r.aWins, other: isA ? r.userB : r.userA, muted: isA ? r.mutedA : r.mutedB, otherMuted: isA ? r.mutedB : r.mutedA };
}

/**
 * Record one fight (battle or duel) between two traders. Updates the series, runs and best run; makes the pair
 * rivals at 3 fights; notifies on becoming rivals and lead changes; pays XP for retaking a lead (+25) and a
 * 5-in-a-row sweep (+50); posts feed moments when a human is involved. `quiet` skips all side effects (rebuild).
 */
export async function recordFight(u1: string, u2: string, winnerId: string | null, at: Date, opts: { quiet?: boolean; href?: string; coin?: string } = {}) {
  if (!u1 || !u2 || u1 === u2) return;
  const r = await getRivalry(u1, u2);
  if (!r) return;
  const prevLead = r.aWins === r.bWins ? null : r.aWins > r.bWins ? r.userA : r.userB;
  const brokenRun = winnerId && r.runHolder && r.runHolder !== winnerId ? { holder: r.runHolder, len: r.runLen } : null;
  const aWins = r.aWins + (winnerId === r.userA ? 1 : 0), bWins = r.bWins + (winnerId === r.userB ? 1 : 0);
  const draws = r.draws + (winnerId ? 0 : 1);
  const fights = r.fights + 1;
  let runHolder = r.runHolder, runLen = r.runLen;
  if (winnerId) { if (runHolder === winnerId) runLen += 1; else { runHolder = winnerId; runLen = 1; } }
  let bestRun = r.bestRun, bestRunHolder = r.bestRunHolder;
  if (runLen > bestRun) { bestRun = runLen; bestRunHolder = runHolder; }
  const becameActive = !r.active && fights >= RIVAL_AT;
  const active = r.active || fights >= RIVAL_AT;
  await db.update(schema.rivalries).set({ aWins, bWins, draws, fights, runHolder, runLen, bestRun, bestRunHolder, active, lastFightAt: at }).where(eq(schema.rivalries.id, r.id));
  if (opts.quiet) return;

  const U = await users([r.userA, r.userB]);
  const A = U.get(r.userA), B = U.get(r.userB);
  if (!A || !B) return;
  const human = !A.isBot || !B.isBot;
  const newLead = aWins === bWins ? null : aWins > bWins ? r.userA : r.userB;
  const score = (me: string) => (me === r.userA ? `${aWins}–${bWins}` : `${bWins}–${aWins}`);
  const href = `/rivalry/${A.handle}/${B.handle}`;

  if (becameActive) {
    for (const [me, them] of [[A, B], [B, A]] as const) {
      if (me.isBot) continue;
      const lead = newLead === me.id ? "you lead" : newLead === them.id ? "they lead" : "all square";
      await notify(me.id, "rival", `${them.handle} is now your rival`, `${fights} fights · ${lead} ${score(me.id)}. You'll hear when they trade.`, href);
    }
  }
  if (active && winnerId && newLead === winnerId && prevLead !== winnerId) {
    const w = winnerId === A.id ? A : B, l = winnerId === A.id ? B : A;
    if (prevLead) await awardXp(w.id, 25, "rival_lead", `rivalry:${r.id}`);
    if (!w.isBot) await notify(w.id, "rival", `You ${prevLead ? "took back" : "took"} the lead over ${l.handle}`, `Series ${score(w.id)}${prevLead ? " · +25 XP" : ""}`, href);
    if (!l.isBot) await notify(l.id, "rival", `${w.handle} ${prevLead ? "took back" : "took"} the lead`, `Series ${score(l.id)}. Run it back?`, href);
    if (human) await systemPost("rivalry", `${w.handle} ${prevLead ? "takes back" : "takes"} the lead over ${l.handle}, ${score(w.id)}.`, { kind: "lead", winner: w.handle, loser: l.handle, score: score(w.id), href }, opts.coin);
  }
  if (winnerId && runHolder === winnerId && runLen === 5) {
    const w = winnerId === A.id ? A : B, l = winnerId === A.id ? B : A;
    await awardXp(w.id, 50, "rival_sweep", `rivalry:${r.id}`);
    if (!w.isBot) await notify(w.id, "rival", `Sweep: 5 straight over ${l.handle}`, "+50 XP", href);
    if (human) await systemPost("rivalry", `${w.handle} has beaten ${l.handle} five times in a row.`, { kind: "sweep", winner: w.handle, loser: l.handle, score: score(w.id), href }, opts.coin);
  }
  if (brokenRun && brokenRun.len >= 3 && human) {
    const ender = winnerId === A.id ? A : B, victim = brokenRun.holder === A.id ? A : B;
    await systemPost("rivalry", `${ender.handle} ends ${victim.handle}'s ${brokenRun.len}-fight run.`, { kind: "streak_end", winner: ender.handle, loser: victim.handle, score: score(ender.id), href }, opts.coin);
  }
}

/** Call someone out: makes the rivalry active straight away and tells them. */
export async function callOut(me: string, them: string) {
  const r = await getRivalry(me, them);
  if (!r) return null;
  await db.update(schema.rivalries).set({ active: true, calledBy: r.calledBy ?? me }).where(eq(schema.rivalries.id, r.id));
  const U = await users([me, them]);
  const M = U.get(me), T = U.get(them);
  if (M && T && !T.isBot) await notify(them, "rival", `${M.handle} called you out`, "They've named you their rival. Answer with a trade.", `/rivalry/${M.handle}/${T.handle}`);
  return r;
}

/** Mute / unmute alerts about the other side. */
export async function setMute(me: string, them: string, muted: boolean) {
  const r = await getRivalry(me, them);
  if (!r) return;
  await db.update(schema.rivalries).set(r.userA === me ? { mutedA: muted } : { mutedB: muted }).where(eq(schema.rivalries.id, r.id));
}

/** Someone opened a trade: ping their active rivals (not muted, rate-limited). */
export async function alertRivals(traderId: string, post: { id: number; coin: string | null; side: string | null; leverage: number | null }) {
  const rows = await db.select().from(schema.rivalries).where(and(eq(schema.rivalries.active, true), or(eq(schema.rivalries.userA, traderId), eq(schema.rivalries.userB, traderId))));
  if (!rows.length) return 0;
  const U = await users([traderId, ...rows.map((r) => (r.userA === traderId ? r.userB : r.userA))]);
  const T = U.get(traderId);
  if (!T) return 0;
  const now = Date.now();
  let sent = 0;
  for (const r of rows) {
    const otherIsA = r.userA !== traderId;
    const other = otherIsA ? r.userA : r.userB;
    const O = U.get(other);
    if (!O || O.isBot) continue;
    if (otherIsA ? r.mutedA : r.mutedB) continue;
    const last = otherIsA ? r.lastAlertA : r.lastAlertB;
    if (last && now - last.getTime() < ALERT_GAP_MS) continue;
    const mine = otherIsA ? r.aWins : r.bWins, theirs = otherIsA ? r.bWins : r.aWins;
    await notify(other, "rival", `Your rival ${T.handle} just went ${post.side} ${post.coin} ${post.leverage ?? 1}×`, `Series ${mine}–${theirs}. Tap to quick fade.`, `/post/${post.id}?fade=1`);
    await db.update(schema.rivalries).set(otherIsA ? { lastAlertA: new Date() } : { lastAlertB: new Date() }).where(eq(schema.rivalries.id, r.id));
    sent++;
  }
  return sent;
}

/** One-time rebuild from every settled battle and duel (when the table is empty). No notifications. */
export async function rebuildRivalries() {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from rivalries`)) as unknown as { n: number }[];
  if (n > 0) return 0;
  const battles = await db.select({ a: schema.battles.faderId, b: schema.battles.targetId, w: schema.battles.winnerId, at: schema.battles.settledAt }).from(schema.battles).where(eq(schema.battles.status, "settled")).orderBy(asc(schema.battles.settledAt));
  const duels = await db.select({ a: schema.duels.challengerId, b: schema.duels.opponentId, w: schema.duels.winnerId, at: schema.duels.settlesAt }).from(schema.duels).where(eq(schema.duels.status, "settled"));
  const all = [...battles, ...duels].filter((f) => f.at).sort((x, y) => x.at!.getTime() - y.at!.getTime());
  for (const f of all) await recordFight(f.a, f.b, f.w, f.at!, { quiet: true });
  return all.length;
}

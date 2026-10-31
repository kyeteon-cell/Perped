import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db, schema, ensureSchema, unjam } from "@/lib/db";
import { getMids } from "@/lib/hl-info";
import { notify, systemPost } from "@/lib/feed";
import { closeTradePost } from "@/lib/trades";
import { backfillBattles, backfillBattleStamps, reopenPrematureBattles, settleBattles } from "@/lib/battles";
import { alertBloodbath } from "@/lib/bloodbath";
import { syncRealPositions } from "@/lib/realsync";
import { fightNightKickoff } from "@/lib/fightnight-server";
import { awardXp } from "@/lib/xp";
import { rebuildRivalries, recordFight } from "@/lib/rivalries";
import { lossPenalty, rankFor, XP } from "@/lib/rank";
import { demoLiqPx } from "@/lib/format";

/**
 * GET /api/cron/resolve → every 5 min: resolve calls (hit / missed / invalidated), close polls, settle duels,
 * and detect market stories (5%+ moves in an hour among coins with live Perped positions).
 * Protected by CRON_SECRET like the stats cron.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  await unjam().catch(() => 0);
  await ensureSchema();
  const mids = await getMids().catch(() => ({} as Record<string, string>));
  const now = new Date();
  const px = (coin: string | null) => (coin ? Number(mids[coin] ?? 0) : 0);
  let hit = 0, missed = 0, polls = 0, duelsSettled = 0, demoClosed = 0;

  // Demo trades by people: take-profit, stop-loss and liquidation, checked against the live mid.
  const openDemo = await db.select({ p: schema.posts, isBot: schema.users.isBot }).from(schema.posts).innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), eq(schema.posts.paper, true), eq(schema.users.isBot, false)));
  for (const { p: t } of openDemo) {
    const mid = px(t.coin); if (!mid || !t.userId) continue;
    const up = t.side === "long", entry = Number(t.entryPx), lev = t.leverage ?? 1;
    const liq = demoLiqPx(t.side as "long" | "short", entry, lev);
    let reason: "tp" | "sl" | "liquidation" | null = null;
    if (up ? mid <= liq : mid >= liq) reason = "liquidation";
    else if (t.slPx && (up ? mid <= Number(t.slPx) : mid >= Number(t.slPx))) reason = "sl";
    else if (t.tpPx && (up ? mid >= Number(t.tpPx) : mid <= Number(t.tpPx))) reason = "tp";
    if (!reason) continue;
    await closeTradePost(t.id, t.userId, { exitPx: reason === "liquidation" ? liq : reason === "sl" ? Number(t.slPx) : Number(t.tpPx), reason, trusted: true });
    demoClosed++;
  }

  // Calls: hit when target printed (we check current mid each run; a 1m-candle check would be stricter), missed on invalidation or deadline.
  const openCalls = await db.select().from(schema.posts).where(and(eq(schema.posts.kind, "call"), eq(schema.posts.callStatus, "open")));
  for (const c of openCalls) {
    const p = px(c.coin);
    if (!p) continue;
    const target = Number(c.targetPx), invalid = c.invalidPx ? Number(c.invalidPx) : null;
    const up = c.side === "long";
    let outcome: "hit" | "missed" | null = null;
    const quick = (c.meta as { quick?: boolean } | null)?.quick === true;
    if (quick) {
      // Quick calls settle only at the deadline, against the price they were made at.
      if (!c.deadline || c.deadline.getTime() > now.getTime()) continue;
      outcome = (up ? p > target : p < target) ? "hit" : "missed";
    } else if (up ? p >= target : p <= target) outcome = "hit";
    else if (invalid && (up ? p <= invalid : p >= invalid)) outcome = "missed";
    else if (c.deadline && c.deadline.getTime() <= now.getTime()) outcome = "missed";
    if (!outcome) continue;
    const [claimed] = await db.update(schema.posts).set({ callStatus: outcome, resolvedAt: now, resolvedPx: String(p), status: "closed" })
      .where(and(eq(schema.posts.id, c.id), eq(schema.posts.callStatus, "open"))).returning({ id: schema.posts.id });
    if (!claimed) continue; // another run already resolved it
    if (c.userId) {
      const [u] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, c.userId)).limit(1);
      await notify(c.userId, outcome === "hit" ? "call_hit" : "call_missed", `Your ${c.coin} call ${outcome === "hit" ? "hit" : "missed"}`, `${target} · now ${p}`, `/post/${c.id}`);
      // "Told you so": name the dislikers who were wrong, likers who were right.
      const disagreed = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.votes).where(and(eq(schema.votes.postId, c.id), eq(schema.votes.value, -1)));
      await db.insert(schema.comments).values({ postId: c.id, userId: c.userId, body: outcome === "hit" ? `✓ HIT at ${p}. ${disagreed[0]?.n ?? 0} people disagreed.` : `✗ MISSED. Target ${target}, ended ${p}.` });
      await awardXp(c.userId, outcome === "hit" ? XP.callHit : XP.callMiss, outcome === "hit" ? "call_hit" : "call_miss", `call:${c.id}`);
      if (outcome === "hit") hit++; else missed++;
      void u;
    }
  }

  // Polls: close and, if price-settled, pick the winner.
  const openPolls = await db.select().from(schema.posts).where(and(eq(schema.posts.kind, "poll"), eq(schema.posts.status, "open"), lte(schema.posts.closesAt, now)));
  for (const poll of openPolls) {
    let settle = poll.settle ?? null;
    if (settle) {
      const p = px(settle.coin);
      if (!p) continue; // no price right now: try again next run instead of settling "No"
      const yes = settle.op === "gte" ? p >= settle.px : p <= settle.px;
      settle = { ...settle, winner: yes ? 0 : 1 };
    }
    await db.update(schema.posts).set({ status: "closed", settle }).where(eq(schema.posts.id, poll.id));
    polls++;
  }

  // Duels: settle by who is ahead at settlesAt, measured from startPx on each side.
  const dueDuels = await db.select().from(schema.duels).where(and(eq(schema.duels.status, "live"), lte(schema.duels.settlesAt, now)));
  for (const d of dueDuels) {
    const p = px(d.coin), start = Number(d.startPx ?? 0);
    if (!p || !start) continue;
    const challengerWins = d.challengerSide === "long" ? p > start : p < start;
    const winnerId = challengerWins ? d.challengerId : d.opponentId;
    const [claimed] = await db.update(schema.duels).set({ status: "settled", winnerId, endPx: String(p) })
      .where(and(eq(schema.duels.id, d.id), eq(schema.duels.status, "live"))).returning({ id: schema.duels.id });
    if (!claimed) continue;
    const [w, l] = await Promise.all([
      db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, winnerId)).limit(1),
      db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, challengerWins ? d.opponentId : d.challengerId)).limit(1),
    ]);
    await systemPost("duel_settled", `${w[0]?.handle} beat ${l[0]?.handle} on ${d.coin}. ${start} → ${p}.`, { duelId: d.id, winner: w[0]?.handle, loser: l[0]?.handle, coin: d.coin, start, end: p }, d.coin);
    for (const uid of [d.challengerId, d.opponentId]) {
      const won = uid === winnerId;
      const [ux] = await db.select({ xp: schema.users.xp }).from(schema.users).where(eq(schema.users.id, uid)).limit(1);
      const pen = won ? 0 : lossPenalty(rankFor(ux?.xp ?? 0).level, "duel");
      const delta = won ? XP.duelWin : pen < 0 ? pen : XP.duelLoss;
      await awardXp(uid, delta, won ? "duel_win" : "duel_loss", `duel:${d.id}`);
      await notify(uid, "duel", won ? "You won the duel" : "You lost the duel", `${d.coin} · ${start} → ${p} · ${delta >= 0 ? "+" : ""}${delta} XP`, `/duels/${d.id}`);
    }
    await recordFight(d.challengerId, d.opponentId, winnerId, now, { coin: d.coin, href: `/duels/${d.id}` }).catch(() => null);
    duelsSettled++;
  }

  // Clean up bursts of battle cards (a backfill settling many in the same minute): keep 3 per minute, drop the rest.
  await db.execute(sql`delete from posts where id in (select id from (select id, row_number() over (partition by date_trunc('minute', created_at) order by created_at desc) as rn from posts where kind = 'system' and system_type = 'battle_settled' and created_at > now() - interval '12 hours') x where rn > 3)`).catch(() => null);
  await rebuildRivalries().catch(() => 0);
  // Real-money positions closed directly on Hyperliquid: close the post at the real exit.
  const realSynced = await syncRealPositions().catch(() => 0);
  // Battles (fades): make sure every fade has one, then settle the decided ones.
  await backfillBattles().catch(() => 0);
  const reopened = await reopenPrematureBattles().catch(() => 0);
  const battles = await settleBattles(mids).catch(() => 0);
  await backfillBattleStamps().catch(() => 0);
  const bloodbath = await alertBloodbath(mids).catch(() => 0);
  const fightNight = await fightNightKickoff().catch(() => 0);

  return Response.json({ hit, missed, polls, duelsSettled, demoClosed, realSynced, reopened, battles, bloodbath, fightNight, at: now.toISOString() });
}

// keep isNull imported for future invalidation-by-candle checks
void isNull;

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify, systemPost } from "./feed";
import { pnlForPosition } from "./format";
import { lossPenalty, rankFor, XP } from "./rank";
import { awardXp } from "./xp";
import { recordFight } from "./rivalries";

const DAY = 24 * 60 * 60 * 1000;
/** A win streak this long carries a bounty for whoever breaks it. */
export const BOUNTY_STREAK = 5;

/** Record a battle when someone fades a trade. Safe to call twice. */
export async function ensureBattle(faderPostId: number) {
  const [fade] = await db.select().from(schema.posts).where(eq(schema.posts.id, faderPostId)).limit(1);
  if (!fade || !fade.fadedFromId || !fade.userId || fade.kind !== "trade") return null;
  const [target] = await db.select().from(schema.posts).where(eq(schema.posts.id, fade.fadedFromId)).limit(1);
  if (!target || !target.userId || target.userId === fade.userId) return null;
  const [row] = await db.insert(schema.battles)
    .values({ faderPostId: fade.id, targetPostId: target.id, faderId: fade.userId, targetId: target.userId, coin: fade.coin ?? target.coin ?? "?" })
    .onConflictDoNothing().returning();
  return row ?? null;
}

/** Create battle rows for any fades that predate the battles table. */
export async function backfillBattles(limit = 200) {
  const missing = await db.select({ id: schema.posts.id }).from(schema.posts)
    .leftJoin(schema.battles, eq(schema.battles.faderPostId, schema.posts.id))
    .where(and(eq(schema.posts.kind, "trade"), sql`${schema.posts.fadedFromId} is not null`, isNull(schema.battles.id))).orderBy(desc(schema.posts.id)).limit(limit);
  for (const m of missing) await ensureBattle(m.id);
  return missing.length;
}

type P = typeof schema.posts.$inferSelect;
function roiOf(p: P, mid: number) {
  const entry = Number(p.entryPx), lev = p.leverage ?? 1;
  const mark = p.status === "closed" ? Number(p.exitPx ?? entry) : mid || entry;
  const pct = pnlForPosition(p.side as "long" | "short", entry, mark, Number(p.size)).pct;
  const liq = p.status === "closed" && (p.meta as { closeReason?: string } | null)?.closeReason === "liquidation";
  return { roi: liq ? -100 : pct * lev, liq };
}

/**
 * Settle battles that are decided:
 *  - both positions closed → compare realised ROI (leverage-adjusted);
 *  - one side liquidated → they lose immediately;
 *  - one side closed for 24h and the other still open → the open side is marked at the live price.
 * A gap under 0.5% ROI is a draw.
 */
export async function settleBattles(mids: Record<string, string | number>) {
  const open = await db.select().from(schema.battles).where(eq(schema.battles.status, "open")).orderBy(schema.battles.id).limit(300);
  if (!open.length) return 0;
  const ids = [...new Set(open.flatMap((b) => [b.faderPostId, b.targetPostId]))];
  const P = new Map((await db.select().from(schema.posts).where(inArray(schema.posts.id, ids))).map((p) => [p.id, p]));
  let settled = 0;
  for (const b of open) {
    const f = P.get(b.faderPostId), t = P.get(b.targetPostId);
    if (!f || !t) continue;
    // Each leg is marked at its own coin's price.
    const fMid = Number(mids[f.coin ?? b.coin] ?? 0), tMid = Number(mids[t.coin ?? b.coin] ?? 0);
    const mid = Math.min(fMid, tMid);
    const fr = roiOf(f, fMid), tr = roiOf(t, tMid);
    const bothClosed = f.status === "closed" && t.status === "closed";
    const firstClose = [f.closedAt, t.closedAt].filter(Boolean).map((d) => new Date(d as Date).getTime()).sort()[0];
    // Closed on one side for a day, or nobody closed for a week: mark at the live price.
    const stale = Date.now() - new Date(b.createdAt as unknown as string).getTime() > 7 * DAY;
    const timedOut = !bothClosed && mid > 0 && ((!!firstClose && Date.now() - firstClose > DAY) || stale);
    const liquidated = fr.liq || tr.liq;
    if (!bothClosed && !timedOut && !liquidated) continue;
    const reason = liquidated ? "liquidation" : bothClosed ? "both_closed" : "timeout";

    const gap = fr.roi - tr.roi;
    const winnerId = fr.liq && !tr.liq ? b.targetId : tr.liq && !fr.liq ? b.faderId : Math.abs(gap) < 0.5 ? null : gap > 0 ? b.faderId : b.targetId;
    const loserId = winnerId ? (winnerId === b.faderId ? b.targetId : b.faderId) : null;

    // XP: win pays; a big margin and beating a higher rank pay more; a liquidated loser gets nothing.
    const [[fu], [tu]] = await Promise.all([
      db.select({ handle: schema.users.handle, xp: schema.users.xp, createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, b.faderId)).limit(1),
      db.select({ handle: schema.users.handle, xp: schema.users.xp, createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, b.targetId)).limit(1),
    ]);
    const xpFor = (id: string) => {
      const me = id === b.faderId ? fu : tu, them = id === b.faderId ? tu : fu;
      const myRoi = id === b.faderId ? fr : tr;
      if (!winnerId) return XP.battleDraw;
      if (id === winnerId) {
        // Beating a guest account made today pays draw XP only (no farming wins off throwaway accounts).
        const oppId = id === b.faderId ? b.targetId : b.faderId;
        if (oppId.startsWith("guest:") && them?.createdAt && Date.now() - new Date(them.createdAt).getTime() < DAY) return XP.battleDraw;
        let x: number = XP.battleWin;
        if (Math.abs(gap) >= 20) x += XP.battleWinBigMargin;
        if (rankFor(them?.xp ?? 0).level - rankFor(me?.xp ?? 0).level >= 2) x += XP.upsetBonus;
        return x;
      }
      const lvl = rankFor(me?.xp ?? 0).level;
      const pen = lossPenalty(lvl, myRoi.liq ? "liquidation" : "battle");
      return pen < 0 ? pen : myRoi.liq ? XP.battleLiquidatedLoss : XP.battleLoss;
    };
    const xpF = xpFor(b.faderId), xpT = xpFor(b.targetId);

    const [claimed] = await db.update(schema.battles).set({ status: "settled", winnerId, faderRoi: fr.roi.toFixed(2), targetRoi: tr.roi.toFixed(2), reason, xpFader: xpF, xpTarget: xpT, settledAt: new Date() })
      .where(and(eq(schema.battles.id, b.id), eq(schema.battles.status, "open"))).returning({ id: schema.battles.id });
    if (!claimed) continue; // another cron run got here first
    await restampPosts([b.faderPostId, b.targetPostId]);
    await recordFight(b.faderId, b.targetId, winnerId, new Date(), { coin: b.coin, href: `/battle/${b.faderPostId}` }).catch(() => null);
    await awardXp(b.faderId, xpF, winnerId ? (winnerId === b.faderId ? "battle_win" : "battle_loss") : "battle_draw", `battle:${b.id}`);
    await awardXp(b.targetId, xpT, winnerId ? (winnerId === b.targetId ? "battle_win" : "battle_loss") : "battle_draw", `battle:${b.id}`);
    if (winnerId && loserId) {
      // Streak bounty: breaking someone's 5+ win streak pays a bonus and makes the feed.
      const prev = await db.select({ w: schema.battles.winnerId }).from(schema.battles)
        .where(and(eq(schema.battles.status, "settled"), sql`${schema.battles.id} <> ${b.id}`, sql`(${schema.battles.faderId} = ${loserId} or ${schema.battles.targetId} = ${loserId})`, sql`${schema.battles.winnerId} is not null`))
        .orderBy(desc(schema.battles.settledAt)).limit(20);
      let broke = 0; for (const p of prev) { if (p.w === loserId) broke++; else break; }
      if (broke >= BOUNTY_STREAK) {
        const bonus = 25 + broke * 10;
        await awardXp(winnerId, bonus, "streak_bounty", `battle:${b.id}`);
        const wh = winnerId === b.faderId ? fu?.handle : tu?.handle, lh = winnerId === b.faderId ? tu?.handle : fu?.handle;
        await systemPost("bounty", `${wh} broke ${lh}'s ${broke}-win streak on ${b.coin} and claimed the bounty: +${bonus} XP.`, { handle: wh, loser: lh, streak: broke, bonus, battleId: b.id, faderPostId: b.faderPostId }, b.coin);
        await notify(winnerId, "battle", `💰 Bounty claimed: you broke ${lh}'s ${broke}-win streak`, `+${bonus} XP on top of the win`, `/battle/${b.faderPostId}`);
      }
      await db.update(schema.stats).set({ battlesWon: sql`${schema.stats.battlesWon} + 1` }).where(eq(schema.stats.userId, winnerId));
      await db.update(schema.stats).set({ battlesLost: sql`${schema.stats.battlesLost} + 1` }).where(eq(schema.stats.userId, loserId));
    }

    const href = `/battle/${b.faderPostId}`;
    const fmt = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`;
    const line = `${fu?.handle} ${fmt(fr.roi)} vs ${tu?.handle} ${fmt(tr.roi)}`;
    if (!winnerId) {
      for (const id of [b.faderId, b.targetId]) await notify(id, "battle", `Battle drawn on ${b.coin}`, `${line} · +${XP.battleDraw} XP`, href);
    } else {
      const wh = winnerId === b.faderId ? fu?.handle : tu?.handle, lh = winnerId === b.faderId ? tu?.handle : fu?.handle;
      const wx = winnerId === b.faderId ? xpF : xpT, lx = winnerId === b.faderId ? xpT : xpF;
      await notify(winnerId, "battle", `You won the battle vs ${lh}`, `${b.coin} · ${line} · +${wx} XP${reason === "liquidation" ? " · they got liquidated" : ""} · tap to pin it to your profile`, href);
      await notify(loserId!, "battle", `You got perped by ${wh}`, `${b.coin} · ${line}${lx > 0 ? ` · +${lx} XP for showing up` : lx < 0 ? ` · ${lx} XP (losses cost at your rank)` : " · liquidated, no XP"}`, href);
      const lastClose = Math.max(...[f.closedAt, t.closedAt].filter(Boolean).map((d) => new Date(d as Date).getTime()), 0);
      const fresh = reason === "timeout" || Date.now() - lastClose < 6 * 60 * 60 * 1000;
      if (fresh) await systemPost("battle_settled", `${wh} perped ${lh} on ${b.coin}. ${line}.`, { battleId: b.id, faderPostId: b.faderPostId, winner: wh, loser: lh, coin: b.coin, winnerRoi: winnerId === b.faderId ? fr.roi : tr.roi, loserRoi: winnerId === b.faderId ? tr.roi : fr.roi, reason }, b.coin);
    }
    settled++;
  }
  return settled;
}

/**
 * Work out each trade's battle label from ALL the battles it was in (a trade can be faded by several people,
 * so it can have several battles). Shown result = best outcome: a win beats a draw beats a loss; among wins,
 * the widest margin. Also stores the trade's battle record. Only writes rows whose label actually changed.
 */
export async function restampPosts(postIds: number[]) {
  const ids = [...new Set(postIds)].filter(Boolean);
  if (!ids.length) return 0;
  const battles = await db.select().from(schema.battles).where(and(eq(schema.battles.status, "settled"), sql`(${schema.battles.faderPostId} in ${ids} or ${schema.battles.targetPostId} in ${ids})`));
  const uids = [...new Set(battles.flatMap((b) => [b.faderId, b.targetId]))];
  const users = uids.length ? await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(sql`${schema.users.id} in ${uids}`) : [];
  const H = new Map(users.map((u) => [u.id, u.handle]));
  const posts = await db.select({ id: schema.posts.id, meta: schema.posts.meta }).from(schema.posts).where(sql`${schema.posts.id} in ${ids}`);
  let changed = 0;
  for (const p of posts) {
    const mine = battles.filter((b) => b.faderPostId === p.id || b.targetPostId === p.id).map((b) => {
      const isFader = b.faderPostId === p.id;
      const meId = isFader ? b.faderId : b.targetId, oppId = isFader ? b.targetId : b.faderId;
      const my = Number(isFader ? b.faderRoi : b.targetRoi), their = Number(isFader ? b.targetRoi : b.faderRoi);
      return { battleId: b.id, faderPostId: b.faderPostId, vs: H.get(oppId), won: b.winnerId ? b.winnerId === meId : null, myRoi: my, theirRoi: their, reason: b.reason };
    });
    if (!mine.length) continue;
    const score = (x: (typeof mine)[number]) => (x.won === true ? 2 : x.won === null ? 1 : 0) * 1e6 + (x.myRoi - x.theirRoi);
    const best = [...mine].sort((a, b) => score(b) - score(a))[0];
    const record = { won: mine.filter((m) => m.won === true).length, lost: mine.filter((m) => m.won === false).length, drawn: mine.filter((m) => m.won === null).length };
    const all = [...mine].sort((a, b) => score(b) - score(a));
    const cur = (p.meta ?? {}) as { battle?: { battleId?: number; won?: boolean | null }; battleRecord?: typeof record; battles?: unknown[] };
    if (cur.battle?.battleId === best.battleId && cur.battle?.won === best.won && JSON.stringify(cur.battleRecord) === JSON.stringify(record) && (cur.battles?.length ?? 0) === all.length) continue;
    await db.update(schema.posts).set({ meta: sql`coalesce(${schema.posts.meta}, '{}'::jsonb) || ${JSON.stringify({ battle: best, battleRecord: record, battles: all })}::jsonb` }).where(eq(schema.posts.id, p.id));
    changed++;
  }
  return changed;
}

/** Cron sweep: re-derive labels for trades in the most recent settled battles (fixes any old overwritten stamps). */
export async function backfillBattleStamps(limit = 300) {
  const rows = await db.select({ f: schema.battles.faderPostId, t: schema.battles.targetPostId }).from(schema.battles).where(eq(schema.battles.status, "settled")).orderBy(desc(schema.battles.settledAt)).limit(limit);
  return restampPosts(rows.flatMap((r) => [r.f, r.t]));
}

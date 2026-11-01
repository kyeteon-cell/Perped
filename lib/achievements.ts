// Server-side trophies: work out each player's progress from their history, unlock what they've earned,
// tell them (and their followers for gold and up) and put it in the feed.
import { sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify } from "./feed";
import { TROPHIES, TROPHY, TIER_LABEL, TIER_RANK, type Trophy } from "./trophies";
import { FN_HOUR_UTC } from "./fightnight";
import { getLiveSettings } from "./live";
import { pushTo } from "./push";

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const n = (v: unknown) => Number(v ?? 0);

export type Metrics = Record<string, number>;

/** Everything the trophies measure, for one player. A handful of indexed queries. */
export async function metricsFor(userId: string): Promise<Metrics> {
  const roi = sql`((exit_px::float - entry_px::float) / nullif(entry_px::float, 0) * 100 * coalesce(leverage, 1) * (case when side = 'long' then 1 else -1 end))`;
  const [trades, closed, fights, rival, social, calls, recruits, low] = await Promise.all([
    db.execute(sql`select count(*)::int as trades,
        count(*) filter (where faded_from_id is not null)::int as fades,
        count(*) filter (where copied_from_id is not null)::int as copies,
        count(*) filter (where sl_px is not null)::int as stop_trades,
        count(*) filter (where coalesce(closed_at, now()) - created_at >= interval '24 hours' and coalesce(meta->>'closeReason', '') <> 'liquidation')::int as held24,
        count(*) filter (where status = 'closed' and closed_at - created_at >= interval '7 days' and exit_px is not null and ${roi} > 0)::int as held7win,
        coalesce(max(${roi}) filter (where status = 'closed' and exit_px is not null), 0)::float as best_roi
      from posts where user_id = ${userId} and kind = 'trade'`),
    db.execute(sql`select coalesce(leverage, 1) as lev, coalesce(meta->>'closeReason', '') as reason
      from posts where user_id = ${userId} and kind = 'trade' and status = 'closed' order by closed_at asc`),
    db.execute(sql`select b.winner_id, b.reason, b.created_at, b.fader_id, b.fader_low, b.target_low,
        case when b.fader_id = ${userId} then b.xp_fader else b.xp_target end as my_xp,
        fp.closed_at as f_closed, tp.closed_at as t_closed
      from battles b left join posts fp on fp.id = b.fader_post_id left join posts tp on tp.id = b.target_post_id
      where b.status = 'settled' and (b.fader_id = ${userId} or b.target_id = ${userId}) order by b.settled_at asc`),
    db.execute(sql`select coalesce(max(case when user_a = ${userId} then a_wins - b_wins else b_wins - a_wins end), 0)::int as lead
      from rivalries where user_a = ${userId} or user_b = ${userId}`),
    db.execute(sql`select
        (select count(*) from posts s join posts f on f.copied_from_id = s.id where s.user_id = ${userId} and f.user_id <> ${userId})::int as copied,
        (select count(*) from posts s join posts f on f.faded_from_id = s.id where s.user_id = ${userId} and f.user_id <> ${userId})::int as faded,
        (select count(*) from xp_log where user_id = ${userId} and reason = 'streak_bounty')::int as bounties`),
    db.execute(sql`select count(*) filter (where call_status = 'hit')::int as hit, count(*) filter (where call_status in ('hit','missed'))::int as resolved
      from posts where user_id = ${userId} and kind = 'call'`),
    db.execute(sql`select count(*)::int as n from users r where r.referred_by = ${userId} and exists (select 1 from posts p where p.user_id = r.id and p.kind = 'trade')`),
    getLiveSettings(),
  ]);
  const t = rows(trades)[0] ?? {}, s = rows(social)[0] ?? {}, c = rows(calls)[0] ?? {};

  // Clean sheet: longest run of closed trades at 5×+ without a liquidation (lower-leverage trades don't break or extend it).
  let run = 0, cleanRun = 0;
  for (const r of rows(closed)) { if (n(r.lev) < 5) continue; if (r.reason === "liquidation") run = 0; else { run++; cleanRun = Math.max(cleanRun, run); } }

  let streak = 0, bestStreak = 0, upsets = 0, liqWins = 0, lastStandWins = 0, comebacks = 0;
  const fnWins = new Map<string, number>();
  for (const b of rows(fights)) {
    const won = b.winner_id === userId;
    if (b.winner_id == null) { streak = 0; continue; }
    if (!won) { streak = 0; continue; }
    streak++; bestStreak = Math.max(bestStreak, streak);
    const at = new Date(String(b.created_at)), fn = at.getUTCHours() === FN_HOUR_UTC;
    // Upset bonus is the only way a win's XP reaches 100 before the Fight Night double.
    if (n(b.my_xp) / (fn ? 2 : 1) >= 100) upsets++;
    if (b.reason === "liquidation") liqWins++;
    const meFader = b.fader_id === userId;
    const mine = meFader ? b.f_closed : b.t_closed, theirs = meFader ? b.t_closed : b.f_closed;
    if (mine && theirs && new Date(String(theirs)) < new Date(String(mine))) lastStandWins++;
    const myLow = meFader ? b.fader_low : b.target_low;
    if (myLow != null && n(myLow) <= -50) comebacks++;
    if (fn) { const d = at.toISOString().slice(0, 10); fnWins.set(d, (fnWins.get(d) ?? 0) + 1); }
  }
  const hit = n(c.hit), resolved = n(c.resolved);
  return {
    trades: n(t.trades), fades: n(t.fades), copies: n(t.copies), stopTrades: n(t.stop_trades), held24: n(t.held24), held7Win: n(t.held7win), bestRoi: n(t.best_roi),
    callsHit: hit, prophet: resolved >= 20 && hit / resolved >= 0.7 ? 1 : 0,
    bestStreak, upsets, bounties: n(s.bounties), liqWins, lastStandWins, comebacks, fightNightBest: Math.max(0, ...fnWins.values()),
    rivalLead: n(rows(rival)[0]?.lead), cleanRun, copied: n(s.copied), faded: n(s.faded), recruits: n(rows(recruits)[0]?.n),
    // Season 0: anyone who trades while real money is closed (it can't be earned once it opens).
    season0: !(low as { open: boolean }).open && n(t.trades) > 0 ? 1 : 0,
  };
}

export const earned = (m: Metrics, t: Trophy) => (m[t.metric] ?? 0) >= t.goal;

/**
 * Unlock anything newly earned. `silent` (the first backfill) records without notifications or feed posts.
 * Returns the newly unlocked keys.
 */
export async function syncAchievements(userId: string, opts: { silent?: boolean } = {}) {
  const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle, isBot: schema.users.isBot, isDemo: schema.users.isDemo }).from(schema.users).where(sql`${schema.users.id} = ${userId}`).limit(1);
  if (!u || u.isBot) return [] as string[];
  const m = await metricsFor(userId);
  const have = new Set(rows(await db.execute(sql`select key from achievements where user_id = ${userId}`)).map((r) => String(r.key)));
  const fresh = TROPHIES.filter((t) => !have.has(t.key) && earned(m, t));
  if (!fresh.length) return [];
  const inserted: string[] = [];
  for (const t of fresh) {
    const r = rows(await db.execute(sql`insert into achievements (user_id, key, tier, paper) values (${userId}, ${t.key}, ${t.tier}, ${!!u.isDemo}) on conflict (user_id, key) do nothing returning key`));
    if (r.length) inserted.push(t.key);
  }
  // Until the one-time backfill has run, record quietly: old history shouldn't flood feeds and notifications.
  const [bf] = rows(await db.execute(sql`select 1 from app_settings where key = 'trophies_backfill' limit 1`));
  if (!inserted.length || opts.silent || !bf) return inserted;
  await announce(u, inserted).catch(() => null);
  return inserted;
}

/** Tell them, tell followers (gold and up), and post to the feed (one post per hour per person, merged). */
async function announce(u: { id: string; handle: string; isDemo: boolean }, keys: string[]) {
  const ts = keys.map((k) => TROPHY[k]).filter(Boolean).sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const href = `/u/${u.handle}?trophy=${ts[0].key}`;
  for (const t of ts) await notify(u.id, "achievement", `Trophy unlocked: ${t.name}`, `${TIER_LABEL[t.tier]} · ${t.desc}`, `/u/${u.handle}?trophy=${t.key}`);
  const big = ts.filter((t) => TIER_RANK[t.tier] >= 3);
  if (big.length) {
    const fol = rows(await db.execute(sql`select follower_id from follows where followee_id = ${u.id} limit 500`)).map((r) => String(r.follower_id));
    if (fol.length) {
      const title = `${u.handle} unlocked ${big.map((t) => t.name).join(", ")}`;
      await db.insert(schema.notifications).values(fol.map((id) => ({ userId: id, type: "achievement", title, body: `${TIER_LABEL[big[0].tier]} trophy`, href })));
      await pushTo(fol, { title, body: `${TIER_LABEL[big[0].tier]} trophy`, href, tag: "achievement" }).catch(() => null);
    }
  }
  // Merge into this person's trophy post from the last hour, if there is one.
  const [recent] = rows(await db.execute(sql`select id, meta from posts where kind = 'system' and system_type = 'achievement' and meta->>'userId' = ${u.id} and created_at > now() - interval '1 hour' order by created_at desc limit 1`));
  if (recent) {
    const meta = (recent.meta ?? {}) as { keys?: string[] };
    const all = [...new Set([...(meta.keys ?? []), ...keys])];
    await db.execute(sql`update posts set meta = ${JSON.stringify({ ...meta, keys: all })}::jsonb, body = ${`${u.handle} unlocked ${all.length} trophies`} where id = ${n(recent.id)}`);
  } else {
    await db.insert(schema.posts).values({ kind: "system", systemType: "achievement", status: "closed", body: `${u.handle} unlocked ${ts.map((t) => t.name).join(", ")}`, meta: { userId: u.id, handle: u.handle, keys, demo: u.isDemo } });
  }
}

/** Run after something that can earn a trophy (a trade, a close, a settled fade). Never throws. */
export async function checkSoon(...userIds: (string | null | undefined)[]) {
  for (const id of [...new Set(userIds.filter(Boolean) as string[])]) await syncAchievements(id).catch(() => null);
}

/** Rarity: share of players (non-bots with at least one trade) holding each trophy. Cached 5 minutes. */
let rarityCache: { at: number; v: Promise<Record<string, number>> } | null = null;
export function rarity() {
  if (rarityCache && Date.now() - rarityCache.at < 300_000) return rarityCache.v;
  const v = (async () => {
    const [tot] = rows(await db.execute(sql`select count(*)::int as n from users u where not u.is_bot and exists (select 1 from posts p where p.user_id = u.id and p.kind = 'trade')`));
    const by = rows(await db.execute(sql`select a.key, count(*)::int as n from achievements a join users u on u.id = a.user_id where not u.is_bot group by a.key`));
    const total = Math.max(1, n(tot?.n));
    return Object.fromEntries(by.map((r) => [String(r.key), Math.round((n(r.n) / total) * 1000) / 10]));
  })();
  rarityCache = { at: Date.now(), v };
  return v;
}

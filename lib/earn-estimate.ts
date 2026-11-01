// What a trader earns (or would have earned on demo) from people trading off them, worked out from the trades
// themselves with the same rules as real payouts: the fee each trader pays at their tier, your share of it,
// fills only count when held 2+ minutes, never your own trades.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_STANDARD_TENTHS_BPS } from "./config";
import { CREATOR_MIN_HOLD_S } from "./programme-rates";

export type Src = { total: number; week: number };
export type EarnEstimate = {
  total: number; week: number;
  sources: { copy: Src; fade: Src; call: Src; invite: Src; invite2: Src };
  daily: { day: string; earned: number }[];
  best: { id: number; coin: string; side: string; leverage: number; copies: number; fades: number; calls: number; earned: number; at: string }[];
  people: { handle: string; avatarUrl: string | null; fills: number; volume: number; earned: number }[];
  recent: { day: string; handle: string; how: "copy" | "fade" | "call"; volume: number; earned: number }[];
};

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const n = (v: unknown) => Number(v ?? 0);

/**
 * paper = true → demo trades (the "would've earned" view); false → real trades.
 * Rates are percentages: creatorPct of fees on copies/fades/call trades, invitePct on people you invited, l2Pct on theirs.
 */
export async function estimateEarnings(userId: string, paper: boolean, rates: { creatorPct: number; invitePct: number; l2Pct: number }): Promise<EarnEstimate> {
  const STD = BUILDER_FEE_STANDARD_TENTHS_BPS, REF = BUILDER_FEE_REFERRED_TENTHS_BPS;
  // Fee per trade: notional × the trader's rate, once to open and once more if it's closed.
  const fee = sql`(f.notional_usd::float * (case when u.referred_by is not null then ${REF} else ${STD} end)::float / 100000 * (case when f.status = 'closed' then 2 else 1 end))`;
  const held = sql`coalesce(f.closed_at, now()) - f.created_at >= make_interval(secs => ${CREATOR_MIN_HOLD_S})`;
  const since14 = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
  const [fills, inv] = await Promise.all([
    db.execute(sql`select f.id, f.created_at::date::text as day, f.notional_usd::float as volume, ${fee} as fee,
        case when f.copied_from_id is not null then 'copy' when f.faded_from_id is not null then 'fade' else 'call' end as how,
        s.id as src, s.coin, s.side, coalesce(s.leverage, 1) as leverage, s.created_at as at, u.handle, u.avatar_url as "avatarUrl"
      from posts f join users u on u.id = f.user_id
      join posts s on s.id = coalesce(f.copied_from_id, f.faded_from_id, f.backed_post_id)
      where (f.copied_from_id in (select id from posts where user_id = ${userId})
          or f.faded_from_id in (select id from posts where user_id = ${userId})
          or f.backed_post_id in (select id from posts where user_id = ${userId}))
        and s.user_id = ${userId} and f.user_id <> ${userId} and f.kind = 'trade' and f.paper = ${paper}
        and f.notional_usd is not null and ${held}
      order by f.created_at desc limit 5000`),
    db.execute(sql`select f.created_at::date::text as day, ${fee} as fee, case when u.referred_by = ${userId} then 1 else 2 end as lvl
      from posts f join users u on u.id = f.user_id
      where f.kind = 'trade' and f.paper = ${paper} and f.notional_usd is not null
        and (u.referred_by = ${userId} or u.referred_by in (select id from users where referred_by = ${userId}))
      limit 10000`),
  ]);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const blank = (): Src => ({ total: 0, week: 0 });
  const sources = { copy: blank(), fade: blank(), call: blank(), invite: blank(), invite2: blank() };
  const daily = new Map<string, number>();
  const best = new Map<number, EarnEstimate["best"][number]>();
  const people = new Map<string, EarnEstimate["people"][number]>();
  const recent: EarnEstimate["recent"] = [];
  const add = (s: Src, day: string, v: number) => { s.total += v; if (day >= weekAgo) s.week += v; if (day >= since14) daily.set(day, (daily.get(day) ?? 0) + v); };

  for (const r of rows(fills)) {
    const how = String(r.how) as "copy" | "fade" | "call", day = String(r.day), v = (n(r.fee) * rates.creatorPct) / 100;
    add(sources[how], day, v);
    const id = n(r.src);
    const b = best.get(id) ?? { id, coin: String(r.coin ?? ""), side: String(r.side ?? ""), leverage: n(r.leverage), copies: 0, fades: 0, calls: 0, earned: 0, at: String(r.at) };
    b[how === "copy" ? "copies" : how === "fade" ? "fades" : "calls"]++; b.earned += v; best.set(id, b);
    const h = String(r.handle);
    const p = people.get(h) ?? { handle: h, avatarUrl: (r.avatarUrl as string | null) ?? null, fills: 0, volume: 0, earned: 0 };
    p.fills++; p.volume += n(r.volume); p.earned += v; people.set(h, p);
    if (recent.length < 20) recent.push({ day, handle: h, how, volume: n(r.volume), earned: v });
  }
  for (const r of rows(inv)) {
    const lvl = n(r.lvl), v = (n(r.fee) * (lvl === 1 ? rates.invitePct : rates.l2Pct)) / 100;
    if (v > 0) add(lvl === 1 ? sources.invite : sources.invite2, String(r.day), v);
  }
  const all = Object.values(sources);
  const days: EarnEstimate["daily"] = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10); days.push({ day: d, earned: daily.get(d) ?? 0 }); }
  return {
    total: all.reduce((a, s) => a + s.total, 0), week: all.reduce((a, s) => a + s.week, 0), sources, daily: days,
    best: [...best.values()].sort((a, b) => b.earned - a.earned).slice(0, 5),
    people: [...people.values()].sort((a, b) => b.earned - a.earned).slice(0, 6),
    recent,
  };
}

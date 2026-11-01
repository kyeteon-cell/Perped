import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { getAuth, getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RANGES = { "1d": 1, "7d": 7, "28d": 28, "1y": 365, all: null } as const;
export type CardRange = keyof typeof RANGES;
export type CardStats = {
  range: CardRange; won: number; lost: number; drawn: number; form: ("W" | "L" | "D")[]; streak: number; bestStreak: number;
  closedTrades: number; tradesWon: number; pnl: number | null; callsHit: number; callsResolved: number; copied: number; faded: number; xp: number;
};
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const n = (v: unknown) => Number(v ?? 0);

/** GET /api/profile/:handle/card?range=1d|7d|28d|1y|all → the numbers for the share card over that period. */
export async function GET(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  await ensureSchema();
  const { handle } = await ctx.params;
  const r = (new URL(req.url).searchParams.get("range") ?? "all") as CardRange;
  const days = Object.hasOwn(RANGES, r) ? RANGES[r] : null;
  const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
  const [u] = rows(await db.execute(sql`select id, is_demo, show_sizes from users where handle = ${handle.toLowerCase()} limit 1`));
  if (!u) return Response.json({ error: "not found" }, { status: 404 });
  const id = String(u.id), paper = !!u.is_demo;
  // Dollar P&L only when they show sizes publicly, or it's their own card.
  const auth = await getAuth(req).catch(() => null);
  const viewer = auth ? await getProfile(auth.privyId).catch(() => null) : null;
  const showUsd = !!u.show_sizes || viewer?.id === id;
  const [fights, trades, calls, offMe, xp] = await Promise.all([
    db.execute(sql`select case when winner_id = ${id} then 'W' when winner_id is null then 'D' else 'L' end as r
      from battles where status = 'settled' and (fader_id = ${id} or target_id = ${id}) and settled_at >= ${since} order by settled_at asc`),
    db.execute(sql`select count(*)::int as closed,
        count(*) filter (where (exit_px::float - entry_px::float) * (case when side = 'long' then 1 else -1 end) > 0)::int as won,
        coalesce(sum((exit_px::float - entry_px::float) * coalesce(size::float, 0) * (case when side = 'long' then 1 else -1 end)), 0)::float as pnl
      from posts where user_id = ${id} and kind = 'trade' and status = 'closed' and exit_px is not null and paper = ${paper} and closed_at >= ${since}`),
    db.execute(sql`select count(*) filter (where call_status = 'hit')::int as hit, count(*) filter (where call_status in ('hit','missed'))::int as resolved
      from posts where user_id = ${id} and kind = 'call' and resolved_at >= ${since}`),
    db.execute(sql`select
        (select count(*) from posts s join posts f on f.copied_from_id = s.id where s.user_id = ${id} and f.user_id <> ${id} and f.created_at >= ${since})::int as copied,
        (select count(*) from posts s join posts f on f.faded_from_id = s.id where s.user_id = ${id} and f.user_id <> ${id} and f.created_at >= ${since})::int as faded`),
    db.execute(sql`select coalesce(sum(delta),0)::int as xp from xp_log where user_id = ${id} and created_at >= ${since}`),
  ]);
  const form = rows(fights).map((x) => String(x.r) as "W" | "L" | "D");
  let streak = 0, best = 0, run = 0;
  for (const f of form) { run = f === "W" ? run + 1 : 0; best = Math.max(best, run); }
  for (let i = form.length - 1; i >= 0 && form[i] === "W"; i--) streak++;
  const t = rows(trades)[0] ?? {}, c = rows(calls)[0] ?? {}, o = rows(offMe)[0] ?? {};
  const out: CardStats = {
    range: days ? r : "all",
    won: form.filter((f) => f === "W").length, lost: form.filter((f) => f === "L").length, drawn: form.filter((f) => f === "D").length,
    form: form.slice(-10), streak, bestStreak: best,
    closedTrades: n(t.closed), tradesWon: n(t.won), pnl: showUsd ? n(t.pnl) : null,
    callsHit: n(c.hit), callsResolved: n(c.resolved), copied: n(o.copied), faded: n(o.faded), xp: n(rows(xp)[0]?.xp),
  };
  return Response.json(out, { headers: { "cache-control": "public, s-maxage=30" } });
}

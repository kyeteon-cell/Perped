import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const revalidate = 0;

type Side = "long" | "short";
export type PulseTrader = { handle: string; avatarUrl: string | null; isDemo: boolean; coin: string; side: Side; entryPx: number; size: number; leverage: number; postId: number };
export type PulseDuel = { id: number; coin: string; stakeUsd: number; settlesAt: string; a: PulseTrader; b: PulseTrader };
export type PulseFade = { coin: string; fader: PulseTrader; target: PulseTrader; createdAt: string };
export type PulseStreak = { handle: string; avatarUrl: string | null; streak: number; isDemo: boolean };
export type Pulse = { duels: PulseDuel[]; open: PulseTrader[]; fades: PulseFade[]; streaks: PulseStreak[]; at: number };

/**
 * GET /api/pulse → what's happening right now, for the animated strip on Home: live duels, every open
 * position (the client ranks them by live P&L), recent fades still open on both sides, and hot streaks.
 * Prices come from the client's WebSocket so this stays cheap and cacheable.
 */
export async function GET() {
  await ensureSchema();
  const trader = (p: typeof schema.posts.$inferSelect, u: { handle: string; avatarUrl: string | null; isDemo: boolean }): PulseTrader => ({
    handle: u.handle, avatarUrl: u.avatarUrl, isDemo: u.isDemo || p.paper, coin: p.coin ?? "", side: p.side as Side, entryPx: Number(p.entryPx), size: Number(p.size), leverage: p.leverage ?? 1, postId: p.id,
  });

  // Open trades (newest 60) with authors.
  const openRows = await db
    .select({ p: schema.posts, u: { handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, isDemo: schema.users.isDemo } })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(and(eq(schema.posts.kind, "trade"), eq(schema.posts.status, "open"), isNotNull(schema.posts.side)))
    .orderBy(desc(schema.posts.id))
    .limit(60);
  const open = openRows.map((r) => trader(r.p, r.u));
  const byId = new Map(openRows.map((r) => [r.p.id, r] as const));

  // Live duels where both legs are still open.
  const duelRows = await db.select().from(schema.duels).where(and(eq(schema.duels.status, "live"), isNotNull(schema.duels.challengerPostId), isNotNull(schema.duels.opponentPostId))).orderBy(desc(schema.duels.id)).limit(8);
  const duels: PulseDuel[] = [];
  for (const d of duelRows) {
    const a = byId.get(d.challengerPostId!), b = byId.get(d.opponentPostId!);
    if (a && b) duels.push({ id: d.id, coin: d.coin, stakeUsd: Number(d.stakeUsd), settlesAt: d.settlesAt.toISOString(), a: trader(a.p, a.u), b: trader(b.p, b.u) });
  }

  // Fades: open trades that faded another trade which is also still open.
  const fades: PulseFade[] = [];
  const fadeRows = openRows.filter((r) => r.p.fadedFromId && byId.has(r.p.fadedFromId));
  for (const r of fadeRows.slice(0, 8)) {
    const t = byId.get(r.p.fadedFromId!)!;
    fades.push({ coin: r.p.coin!, fader: trader(r.p, r.u), target: trader(t.p, t.u), createdAt: r.p.createdAt.toISOString() });
  }

  // Streaks: call streaks of 3+.
  const streakRows = await db
    .select({ handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, isDemo: schema.users.isDemo, streak: schema.stats.callStreak })
    .from(schema.stats)
    .innerJoin(schema.users, eq(schema.users.id, schema.stats.userId))
    .where(gte(schema.stats.callStreak, 3))
    .orderBy(desc(schema.stats.callStreak))
    .limit(5);
  return Response.json({ duels, open, fades, streaks: streakRows, at: Date.now() } satisfies Pulse);
}

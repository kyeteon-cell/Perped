import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { metricsFor, rarity } from "@/lib/achievements";
import { TROPHIES } from "@/lib/trophies";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

export type TrophyRow = { key: string; unlocked: boolean; at: string | null; paper: boolean; value: number; rarity: number | null };

/** GET /api/achievements/:handle → every trophy with unlocked state, progress toward it and how rare it is. */
export async function GET(_req: Request, ctx: { params: Promise<{ handle: string }> }) {
  await ensureSchema();
  const { handle } = await ctx.params;
  const [u] = rows(await db.execute(sql`select id, is_bot from users where handle = ${handle.toLowerCase()} limit 1`));
  if (!u) return Response.json({ error: "not found" }, { status: 404 });
  const id = String(u.id);
  const [got, m, rare] = await Promise.all([
    db.execute(sql`select key, unlocked_at, paper from achievements where user_id = ${id}`),
    u.is_bot ? Promise.resolve({} as Record<string, number>) : metricsFor(id),
    rarity(),
  ]);
  const G = new Map(rows(got).map((r) => [String(r.key), r]));
  const out: TrophyRow[] = TROPHIES.map((t) => {
    const g = G.get(t.key);
    return { key: t.key, unlocked: !!g, at: g ? new Date(String(g.unlocked_at)).toISOString() : null, paper: !!g?.paper, value: Number(m[t.metric] ?? 0), rarity: rare[t.key] ?? 0 };
  });
  return Response.json({ trophies: out }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

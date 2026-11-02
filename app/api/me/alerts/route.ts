import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { ALERT_GROUPS, type AlertPrefs } from "@/lib/alerts";

export const dynamic = "force-dynamic";
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

/** GET → which alert groups push to your phone. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const [r] = rows(await db.execute(sql`select prefs from alert_prefs where user_id = ${auth.privyId}`));
  return Response.json({ prefs: (r?.prefs ?? {}) as AlertPrefs }, { headers: { "cache-control": "private, no-store" } });
}

/** POST {group, on} → turn one group's push on or off. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const b = await req.json().catch(() => null) as { group?: string; on?: boolean } | null;
  if (!b || !ALERT_GROUPS.some((g) => g.key === b.group) || typeof b.on !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  const patch = JSON.stringify({ [b.group as string]: b.on });
  const [r] = rows(await db.execute(sql`insert into alert_prefs (user_id, prefs) values (${auth.privyId}, ${patch}::jsonb)
    on conflict (user_id) do update set prefs = alert_prefs.prefs || excluded.prefs, updated_at = now() returning prefs`));
  return Response.json({ prefs: r?.prefs ?? {} });
}
